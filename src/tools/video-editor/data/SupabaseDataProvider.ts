import { getSupabaseClient } from '@/integrations/supabase/client';
import { generateUUID } from '@/shared/lib/taskCreation/ids';
import { validateSerializedConfig } from '@/tools/video-editor/lib/serialize';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults';
import { extractAssetRegistryEntry } from '@/tools/video-editor/lib/mediaMetadata';
import {
  TimelineNotFoundError,
  TimelineVersionConflictError,
  type DataProvider,
  type LoadedTimeline,
  type UploadAssetOptions,
} from '@/tools/video-editor/data/DataProvider';
import type { AssetRegistry, AssetRegistryEntry, TimelineConfig } from '@/tools/video-editor/types';
import type { Checkpoint } from '@/tools/video-editor/types/history';

const TIMELINE_ASSETS_BUCKET = 'timeline-assets';
const TIMELINE_CHECKPOINT_LIMIT = 30;
const TIMELINE_CHECKPOINT_RETENTION_MS = 24 * 60 * 60 * 1000;

type TimelineCheckpointRow = {
  id: string;
  timeline_id: string;
  config: TimelineConfig;
  created_at: string;
  trigger_type: Checkpoint['triggerType'];
  label: string;
  edits_since_last_checkpoint: number;
};

function mapCheckpointRow(row: TimelineCheckpointRow): Checkpoint {
  return {
    id: row.id,
    timelineId: row.timeline_id,
    config: row.config,
    createdAt: row.created_at,
    triggerType: row.trigger_type,
    label: row.label,
    editsSinceLastCheckpoint: row.edits_since_last_checkpoint,
  };
}

export class SupabaseDataProvider implements DataProvider {
  constructor(
    private readonly options: {
      projectId: string;
      userId: string;
    },
  ) {}

  async loadTimeline(timelineId: string): Promise<LoadedTimeline> {
    const { data, error } = await getSupabaseClient()
      .from('timelines')
      .select('config, config_version')
      .eq('id', timelineId)
      .eq('project_id', this.options.projectId)
      .eq('user_id', this.options.userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      console.error('[SupabaseDataProvider] loadTimeline returned null — project_id/user_id mismatch?', {
        timelineId,
        projectId: this.options.projectId,
        userId: this.options.userId,
      });
    }

    const config = (data?.config ?? createDefaultTimelineConfig()) as TimelineConfig;
    validateSerializedConfig(config);

    return {
      config,
      configVersion: typeof (data as { config_version?: unknown } | null)?.config_version === 'number'
        ? (data as { config_version: number }).config_version
        : 1,
    };
  }

  async saveTimeline(timelineId: string, config: TimelineConfig, expectedVersion: number): Promise<number> {
    validateSerializedConfig(config);

    console.error('[SupabaseDataProvider] saveTimeline called', {
      timelineId,
      expectedVersion,
      clipCount: config.clips?.length,
      timestamp: new Date().toISOString(),
    });

    const { data, error } = await getSupabaseClient()
      .rpc('update_timeline_config_versioned' as never, {
        p_timeline_id: timelineId,
        p_expected_version: expectedVersion,
        p_config: config,
      } as never);

    console.error('[SupabaseDataProvider] saveTimeline response', {
      hasError: !!error,
      errorCode: error?.code,
      errorMessage: error?.message,
      errorHint: (error as { hint?: string } | null)?.hint,
      dataType: typeof data,
      isArray: Array.isArray(data),
      dataLength: Array.isArray(data) ? data.length : 'n/a',
      rawData: data,
    });

    if (error) {
      throw error;
    }

    const rows = data as Array<{ config_version: number }> | null;
    if (!rows || rows.length === 0) {
      // 0 rows can mean version mismatch OR row doesn't exist.
      // Check which one to give the caller an actionable error.
      const { data: existing } = await getSupabaseClient()
        .from('timelines')
        .select('config_version')
        .eq('id', timelineId)
        .maybeSingle();

      if (!existing) {
        console.error('[SupabaseDataProvider] timeline not found', { timelineId, expectedVersion });
        throw new TimelineNotFoundError(timelineId);
      }

      console.error('[SupabaseDataProvider] version conflict — 0 rows returned', {
        expectedVersion,
        actualVersion: existing.config_version,
      });
      throw new TimelineVersionConflictError();
    }

    console.error('[SupabaseDataProvider] save success', { expectedVersion, newVersion: rows[0].config_version });
    return rows[0].config_version;
  }

  async saveCheckpoint(timelineId: string, checkpoint: Omit<Checkpoint, 'id'>): Promise<string> {
    validateSerializedConfig(checkpoint.config);

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('timeline_checkpoints')
      .insert({
        timeline_id: timelineId,
        user_id: this.options.userId,
        config: checkpoint.config,
        trigger_type: checkpoint.triggerType,
        label: checkpoint.label,
        edits_since_last_checkpoint: checkpoint.editsSinceLastCheckpoint,
        created_at: checkpoint.createdAt,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    const { data: checkpointRows, error: checkpointRowsError } = await supabase
      .from('timeline_checkpoints')
      .select('id, trigger_type')
      .eq('timeline_id', timelineId)
      .eq('user_id', this.options.userId)
      .neq('trigger_type', 'manual')
      .order('created_at', { ascending: false });

    if (checkpointRowsError) {
      throw checkpointRowsError;
    }

    const extraCheckpointIds = (checkpointRows ?? [])
      .slice(TIMELINE_CHECKPOINT_LIMIT)
      .map((row) => row.id)
      .filter((id): id is string => typeof id === 'string');

    if (extraCheckpointIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('timeline_checkpoints')
        .delete()
        .in('id', extraCheckpointIds);

      if (deleteError) {
        throw deleteError;
      }
    }

    return data.id;
  }

  async loadCheckpoints(timelineId: string): Promise<Checkpoint[]> {
    const supabase = getSupabaseClient();
    const retentionCutoff = new Date(Date.now() - TIMELINE_CHECKPOINT_RETENTION_MS).toISOString();

    const { error: cleanupError } = await supabase
      .from('timeline_checkpoints')
      .delete()
      .eq('timeline_id', timelineId)
      .eq('user_id', this.options.userId)
      .neq('trigger_type', 'manual')
      .lt('created_at', retentionCutoff);

    if (cleanupError) {
      throw cleanupError;
    }

    const { data, error } = await supabase
      .from('timeline_checkpoints')
      .select('id, timeline_id, config, created_at, trigger_type, label, edits_since_last_checkpoint')
      .eq('timeline_id', timelineId)
      .eq('user_id', this.options.userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => mapCheckpointRow(row as TimelineCheckpointRow));
  }

  async loadAssetRegistry(timelineId: string): Promise<AssetRegistry> {
    const { data, error } = await getSupabaseClient()
      .from('timelines')
      .select('asset_registry')
      .eq('id', timelineId)
      .eq('project_id', this.options.projectId)
      .eq('user_id', this.options.userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data?.asset_registry as AssetRegistry | null) ?? { assets: {} };
  }

  async resolveAssetUrl(file: string): Promise<string> {
    if (/^https?:\/\//.test(file)) {
      return file;
    }

    const { data, error } = await getSupabaseClient()
      .storage
      .from(TIMELINE_ASSETS_BUCKET)
      .createSignedUrl(file, 60 * 60);

    if (error) {
      throw error;
    }

    return data.signedUrl;
  }

  async registerAsset(
    timelineId: string,
    assetId: string,
    entry: AssetRegistryEntry,
  ): Promise<void> {
    const { error } = await getSupabaseClient()
      .rpc('upsert_asset_registry_entry' as never, {
        p_timeline_id: timelineId,
        p_asset_id: assetId,
        p_entry: entry,
      } as never);

    if (error) {
      throw error;
    }
  }

  async uploadAsset(
    file: File,
    options: UploadAssetOptions,
  ): Promise<{ assetId: string; entry: Awaited<ReturnType<typeof extractAssetRegistryEntry>> }> {
    const safeFilename = (options.filename ?? file.name)
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '');
    const storagePath = `${options.userId}/${options.timelineId}/${Date.now()}-${safeFilename}`;

    const { error: uploadError } = await getSupabaseClient()
      .storage
      .from(TIMELINE_ASSETS_BUCKET)
      .upload(storagePath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      throw uploadError;
    }

    const entry = await extractAssetRegistryEntry(file, storagePath);
    const assetId = generateUUID();
    await this.registerAsset(options.timelineId, assetId, entry);

    return { assetId, entry };
  }

  async loadWaveform(): Promise<null> {
    return null;
  }

  async loadAssetProfile(): Promise<null> {
    return null;
  }
}

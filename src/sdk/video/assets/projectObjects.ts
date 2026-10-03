/**
 * Portable project-object contracts for immutable source/package storage.
 *
 * The host binds this narrow port to the active project. It intentionally does
 * not expose provider handles, credentials, project selectors, URLs, overwrite,
 * or delete operations.
 *
 * @publicContract
 */

/** Portable identity and metadata returned by project-object ingestion. */
export interface ProjectObjectMetadata {
  readonly object_id: string;
  readonly digest: string;
  readonly media_type: string;
  readonly size: number;
  readonly filename?: string;
}

/**
 * Generic immutable package descriptor.
 *
 * The descriptor is data, not a registry or an editor API: `entry` and every
 * optional asset are immutable project-object references, while `revision` is
 * the digest of the complete descriptor object that contains them.
 */
export interface ImmutableProjectPackageDescriptor {
  readonly revision: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly entry: ProjectObjectMetadata;
  readonly assets: readonly ProjectObjectMetadata[];
}

/**
 * Project-bound immutable object storage exposed to trusted extensions.
 *
 * `read()` returns raw bytes deliberately. Callers compare those bytes with the
 * digest carried by the timeline/package reference or ingestion result.
 */
export interface ProjectObjectStorage {
  ingest(
    bytes: Uint8Array,
    mediaType: string,
    filename?: string,
  ): Promise<ProjectObjectMetadata>;
  read(objectId: string): Promise<Uint8Array>;
}

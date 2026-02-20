// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { SystemLogger } from "../_shared/systemLogger.ts";
import { authenticateRequest } from "../_shared/auth.ts";

declare const Deno: { env: { get: (key: string) => string | undefined } };

const LOG_PREFIX = "[DISCORD-DAILY-STATS]";

// Chart color palette (dark-theme friendly)
const COLORS = {
  imagesGenerated: { bg: "rgba(129, 140, 248, 0.85)", border: "rgb(129, 140, 248)" },   // indigo-400
  imagesEdited:    { bg: "rgba(251, 146, 191, 0.85)", border: "rgb(251, 146, 191)" },   // pink-300
  videosGenerated: { bg: "rgba(110, 231, 183, 0.85)", border: "rgb(110, 231, 183)" },   // emerald-300
};

interface DayBucket {
  date: string;
  images_generated: number;
  images_edited: number;
  videos_generated: number;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const discordWebhookUrl = Deno.env.get("DISCORD_STATS_WEBHOOK_URL");

  if (!serviceKey || !supabaseUrl) {
    return new Response("Missing required environment variables", { status: 500 });
  }

  if (!discordWebhookUrl) {
    return new Response("DISCORD_STATS_WEBHOOK_URL not configured", { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const logger = new SystemLogger(supabaseAdmin, "discord-daily-stats");

  // Authenticate: service-role only
  const auth = await authenticateRequest(req, supabaseAdmin, LOG_PREFIX);
  if (!auth.success) {
    logger.error(auth.error || "Authentication failed");
    await logger.flush();
    return new Response(auth.error || "Unauthorized", { status: auth.statusCode || 401 });
  }
  if (!auth.isServiceRole) {
    logger.error("Unauthorized request");
    await logger.flush();
    return new Response("Unauthorized", { status: 403 });
  }

  try {
    logger.info("Starting daily stats collection");

    // Query completed tasks grouped by day, categorized into 3 buckets
    const { data: dailyStats, error: statsError } = await supabaseAdmin.rpc(
      "func_daily_task_stats"
    );

    // Task type name → bucket classification (derived from task_types table)
    const IMAGE_GENERATED_TYPES = new Set([
      "wan_2_2_t2i", "single_image", "qwen_image_style", "qwen_image",
      "qwen_image_2512", "z_image_turbo",
    ]);
    const IMAGE_EDITED_TYPES = new Set([
      "image_inpaint", "image_upscale", "image-upscale", "annotated_image_edit",
      "edit_travel_flux", "magic_edit", "image_edit", "qwen_image_edit", "z_image_turbo_i2i",
    ]);
    const VIDEO_GENERATED_TYPES = new Set([
      "animate_character", "individual_travel_segment", "video_enhance",
      "join_clips_orchestrator", "travel_orchestrator", "edit_video_orchestrator",
      "join_final_stitch",
    ]);

    let buckets: DayBucket[];

    if (statsError || !dailyStats) {
      logger.warn("RPC func_daily_task_stats not available, using direct query", {
        error: statsError?.message,
      });

      // Paginate to fetch all completed tasks (default limit is 1000)
      const PAGE_SIZE = 1000;
      const allTasks: { created_at: string; task_type: string }[] = [];
      let offset = 0;
      while (true) {
        const { data: page, error: rawError } = await supabaseAdmin
          .from("tasks")
          .select("created_at, task_type")
          .eq("status", "Complete")
          .gte("created_at", "2026-02-08T00:00:00Z")
          .order("created_at", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (rawError) throw rawError;
        if (!page || page.length === 0) break;
        allTasks.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      // Aggregate in memory
      const dayMap = new Map<string, DayBucket>();
      for (const task of allTasks) {
        const date = task.created_at.substring(0, 10); // YYYY-MM-DD
        if (!dayMap.has(date)) {
          dayMap.set(date, { date, images_generated: 0, images_edited: 0, videos_generated: 0 });
        }
        const bucket = dayMap.get(date)!;
        const name = task.task_type;

        if (IMAGE_GENERATED_TYPES.has(name)) {
          bucket.images_generated++;
        } else if (IMAGE_EDITED_TYPES.has(name)) {
          bucket.images_edited++;
        } else if (VIDEO_GENERATED_TYPES.has(name)) {
          bucket.videos_generated++;
        }
      }

      buckets = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    } else {
      buckets = dailyStats;
    }

    if (buckets.length === 0) {
      logger.info("No stats data found");
      await logger.flush();
      return new Response(JSON.stringify({ message: "No data" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Determine if we should aggregate by week (>90 days of data)
    const shouldAggregateWeekly = buckets.length > 90;
    const periodData = shouldAggregateWeekly ? aggregateByWeek(buckets) : buckets;

    // Convert to cumulative
    const chartData: DayBucket[] = [];
    let cumImg = 0, cumEdit = 0, cumVid = 0;
    for (const b of periodData) {
      cumImg += b.images_generated;
      cumEdit += b.images_edited;
      cumVid += b.videos_generated;
      chartData.push({ date: b.date, images_generated: cumImg, images_edited: cumEdit, videos_generated: cumVid });
    }

    // Calculate yesterday's stats
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().substring(0, 10);
    const yesterdayStats = buckets.find((b) => b.date === yesterdayStr) || {
      date: yesterdayStr,
      images_generated: 0,
      images_edited: 0,
      videos_generated: 0,
    };

    // Calculate all-time totals
    const totals = buckets.reduce(
      (acc, b) => ({
        images_generated: acc.images_generated + b.images_generated,
        images_edited: acc.images_edited + b.images_edited,
        videos_generated: acc.videos_generated + b.videos_generated,
      }),
      { images_generated: 0, images_edited: 0, videos_generated: 0 }
    );

    // Generate chart via QuickChart.io
    const chartUrl = await generateChart(chartData, shouldAggregateWeekly);

    // Format date for title
    const titleDate = yesterday.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

    // Post to Discord
    const embed = {
      title: `Daily Stats — ${titleDate}`,
      color: 0x6366f1, // indigo
      fields: [
        {
          name: "Images Generated",
          value: `**${yesterdayStats.images_generated.toLocaleString()}**`,
          inline: true,
        },
        {
          name: "Images Edited",
          value: `**${yesterdayStats.images_edited.toLocaleString()}**`,
          inline: true,
        },
        {
          name: "Videos Generated",
          value: `**${yesterdayStats.videos_generated.toLocaleString()}**`,
          inline: true,
        },
      ],
      image: chartUrl ? { url: chartUrl } : undefined,
      footer: {
        text: `All time: ${totals.images_generated.toLocaleString()} imgs generated · ${totals.images_edited.toLocaleString()} imgs edited · ${totals.videos_generated.toLocaleString()} videos`,
      },
      timestamp: new Date().toISOString(),
    };

    const discordPayload = { embeds: [embed] };

    const discordRes = await fetch(discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload),
    });

    if (!discordRes.ok) {
      const errText = await discordRes.text();
      throw new Error(`Discord webhook failed (${discordRes.status}): ${errText}`);
    }

    logger.info("Discord message sent successfully", {
      yesterday_images_gen: yesterdayStats.images_generated,
      yesterday_images_edit: yesterdayStats.images_edited,
      yesterday_videos: yesterdayStats.videos_generated,
      chart_url: chartUrl,
    });
    await logger.flush();

    return new Response(
      JSON.stringify({
        success: true,
        yesterday: yesterdayStats,
        totals,
        chart_url: chartUrl,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    logger.error("Failed to generate/send daily stats", { error: error.message });
    await logger.flush();
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
});

/**
 * Aggregate daily buckets into weekly buckets (Mon-Sun weeks)
 */
function aggregateByWeek(buckets: DayBucket[]): DayBucket[] {
  const weekMap = new Map<string, DayBucket>();

  for (const bucket of buckets) {
    const date = new Date(bucket.date + "T00:00:00Z");
    // Get Monday of this week
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday = 1
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() + diff);
    const weekKey = monday.toISOString().substring(0, 10);

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, { date: weekKey, images_generated: 0, images_edited: 0, videos_generated: 0 });
    }
    const week = weekMap.get(weekKey)!;
    week.images_generated += bucket.images_generated;
    week.images_edited += bucket.images_edited;
    week.videos_generated += bucket.videos_generated;
  }

  return Array.from(weekMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Generate a chart image URL via QuickChart.io
 */
async function generateChart(
  data: DayBucket[],
  _isWeekly: boolean
): Promise<string | null> {
  const labels = data.map((d) => {
    const date = new Date(d.date + "T00:00:00Z");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  });

  const chartConfig = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Images Generated",
          data: data.map((d) => d.images_generated),
          borderColor: COLORS.imagesGenerated.border,
          backgroundColor: COLORS.imagesGenerated.bg.replace("0.85", "0.15"),
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: "Images Edited",
          data: data.map((d) => d.images_edited),
          borderColor: COLORS.imagesEdited.border,
          backgroundColor: COLORS.imagesEdited.bg.replace("0.85", "0.15"),
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: "Videos Generated",
          data: data.map((d) => d.videos_generated),
          borderColor: COLORS.videosGenerated.border,
          backgroundColor: COLORS.videosGenerated.bg.replace("0.85", "0.15"),
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: false,
        },
        legend: {
          position: "bottom",
          labels: {
            color: "#cbd5e1",
            padding: 16,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 11 },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#64748b", maxRotation: 45, font: { size: 10 } },
          grid: { display: false },
        },
        y: {
          ticks: { color: "#64748b", font: { size: 10 } },
          grid: { color: "rgba(148, 163, 184, 0.08)" },
          beginAtZero: true,
        },
      },
    },
  };

  try {
    const res = await fetch("https://quickchart.io/chart/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backgroundColor: "#1a1a2e",
        width: 800,
        height: 350,
        format: "png",
        chart: chartConfig,
      }),
    });

    if (!res.ok) {
      console.error(`${LOG_PREFIX} QuickChart error: ${res.status}`);
      return null;
    }

    const result = await res.json();
    return result.url || null;
  } catch (err) {
    console.error(`${LOG_PREFIX} QuickChart request failed:`, err);
    return null;
  }
}

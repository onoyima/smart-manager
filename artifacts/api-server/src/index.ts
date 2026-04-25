import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

import { db, jobsTable, videosTable } from "@workspace/db";
import { inArray, eq } from "drizzle-orm";

app.listen(port, async () => {
  logger.info({ port }, "Server listening");
  
  // Clean up any jobs stuck in processing due to a server restart
  try {
    const stuckJobs = await db.select().from(jobsTable).where(inArray(jobsTable.status, ["processing", "queued"]));
    if (stuckJobs.length > 0) {
      await db.update(jobsTable)
        .set({ 
          status: "failed", 
          stage: "Failed due to server restart", 
          errorMessage: "The server restarted while this job was processing." 
        })
        .where(inArray(jobsTable.status, ["processing", "queued"]));
        
      for (const job of stuckJobs) {
        await db.update(videosTable)
          .set({ status: "failed" })
          .where(eq(videosTable.id, job.videoId));
      }
      logger.info({ count: stuckJobs.length }, "Cleaned up stuck jobs on startup");
    }
  } catch (err) {
    logger.error({ err }, "Failed to clean up stuck jobs");
  }
});



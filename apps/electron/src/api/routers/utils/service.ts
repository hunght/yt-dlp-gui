import * as yauzl from "yauzl";
import path from "path";
import fs from "fs";
import { logger } from "@/helpers/logger";

// Custom ZIP extraction function using yauzl for better error handling
export const extractZipWithYauzl = (zipPath: string, extractDir: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(err);
        return;
      }

      if (!zipfile) {
        reject(new Error("Failed to open ZIP file"));
        return;
      }

      logger.info(`Opened ZIP file with ${zipfile.entryCount} entries`);

      zipfile.readEntry();
      zipfile.on("entry", (entry: yauzl.Entry) => {
        logger.info(`Processing entry: ${entry.fileName}`);

        if (/\/$/.test(entry.fileName)) {
          // Directory entry
          const dirPath = path.join(extractDir, entry.fileName);
          fs.mkdirSync(dirPath, { recursive: true });
          zipfile.readEntry();
        } else {
          // File entry
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              logger.error(`Error opening read stream for ${entry.fileName}:`, err);
              reject(err);
              return;
            }

            if (!readStream) {
              logger.error(`No read stream for ${entry.fileName}`);
              reject(new Error(`No read stream for ${entry.fileName}`));
              return;
            }

            const filePath = path.join(extractDir, entry.fileName);
            const dirPath = path.dirname(filePath);

            // Ensure directory exists
            fs.mkdirSync(dirPath, { recursive: true });

            const writeStream = fs.createWriteStream(filePath);

            readStream.pipe(writeStream);

            writeStream.on("error", (err) => {
              logger.error(`Error writing file ${entry.fileName}:`, err);
              reject(err);
            });

            writeStream.on("close", () => {
              logger.info(`Successfully extracted: ${entry.fileName}`);
              zipfile.readEntry();
            });
          });
        }
      });

      zipfile.on("end", () => {
        logger.info("ZIP extraction completed successfully");
        resolve();
      });

      zipfile.on("error", (err) => {
        logger.error("ZIP extraction error:", err);
        reject(err);
      });
    });
  });
};

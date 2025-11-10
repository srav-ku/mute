import { google } from "googleapis";
import cron from "node-cron";

interface BackupLogEntry {
  timestamp: string;
  filename: string;
  driveLink: string;
  rowCount: number;
}

export class SheetsBackupService {
  private sheets;
  private drive;
  private spreadsheetId: string;
  private driveFolderId: string;
  private auth;
  private messageCounter: number = 0;
  private readonly BACKUP_THRESHOLD = 40000;
  private readonly MESSAGE_CHECK_INTERVAL = 1000;
  private isBackupInProgress: boolean = false;

  constructor() {
    try {
      const serviceAccountKey = JSON.parse(process.env.GOOGLE_SHEETS_API_KEY || "{}");
      
      this.auth = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive",
        ],
      });
      
      this.sheets = google.sheets({ version: "v4", auth: this.auth });
      this.drive = google.drive({ version: "v3", auth: this.auth });
      this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";
      this.driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
    } catch (error) {
      console.error("Error initializing Sheets Backup Service:", error);
      this.sheets = null as any;
      this.drive = null as any;
      this.spreadsheetId = "";
      this.driveFolderId = "";
    }
  }

  async initialize(): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) {
      console.log("Sheets Backup Service not configured, skipping initialization");
      return;
    }

    try {
      await this.initializeBackupLogSheet();
      await this.ensureDriveFolder();
      this.startScheduler();
      console.log("Sheets Backup Service initialized successfully");
    } catch (error) {
      console.error("Error initializing Sheets Backup Service:", error);
    }
  }

  private async initializeBackupLogSheet(): Promise<void> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheets = response.data.sheets || [];
      const backupLogExists = sheets.some(
        (sheet) => sheet.properties?.title === "Backup Log"
      );

      if (!backupLogExists) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: "Backup Log",
                  },
                },
              },
            ],
          },
        });

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: "Backup Log!A1:D1",
          valueInputOption: "RAW",
          requestBody: {
            values: [["timestamp", "filename", "driveLink", "rowCount"]],
          },
        });

        console.log("Backup Log sheet created");
      }
    } catch (error) {
      console.error("Error initializing Backup Log sheet:", error);
    }
  }

  private async ensureDriveFolder(): Promise<void> {
    if (!this.drive) return;

    try {
      if (this.driveFolderId) {
        const folder = await this.drive.files.get({
          fileId: this.driveFolderId,
          fields: "id, name",
        });
        console.log(`Drive folder found: ${folder.data.name}`);
        return;
      }

      const response = await this.drive.files.list({
        q: "name='Mute-Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: "files(id, name)",
      });

      if (response.data.files && response.data.files.length > 0) {
        this.driveFolderId = response.data.files[0].id!;
        console.log(`Existing Mute-Backups folder found: ${this.driveFolderId}`);
      } else {
        const folder = await this.drive.files.create({
          requestBody: {
            name: "Mute-Backups",
            mimeType: "application/vnd.google-apps.folder",
          },
          fields: "id",
        });
        this.driveFolderId = folder.data.id!;
        console.log(`Created Mute-Backups folder: ${this.driveFolderId}`);
      }
    } catch (error) {
      console.error("Error ensuring Drive folder:", error);
    }
  }

  async getRowCount(): Promise<number> {
    if (!this.sheets || !this.spreadsheetId) return 0;

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "Sheet1!A:A",
      });

      const rows = response.data.values || [];
      return rows.length;
    } catch (error) {
      console.error("Error getting row count:", error);
      return 0;
    }
  }

  private async exportToCsv(): Promise<string> {
    if (!this.sheets || !this.spreadsheetId) {
      throw new Error("Sheets not configured");
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "Sheet1!A:L",
      });

      const rows = response.data.values || [];
      
      const csvContent = rows.map(row => 
        row.map(cell => {
          const cellStr = String(cell || "");
          if (cellStr.includes(",") || cellStr.includes('"') || cellStr.includes("\n")) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(",")
      ).join("\n");

      return csvContent;
    } catch (error) {
      console.error("Error exporting to CSV:", error);
      throw error;
    }
  }

  private async uploadToDrive(csvContent: string, filename: string): Promise<string> {
    if (!this.drive || !this.driveFolderId) {
      throw new Error("Drive not configured");
    }

    try {
      const fileMetadata = {
        name: filename,
        parents: [this.driveFolderId],
        mimeType: "text/csv",
      };

      const media = {
        mimeType: "text/csv",
        body: csvContent,
      };

      const file = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: "id, webViewLink",
      });

      await this.drive.permissions.create({
        fileId: file.data.id!,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
      });

      console.log(`Uploaded backup to Drive: ${filename}`);
      return file.data.webViewLink || "";
    } catch (error) {
      console.error("Error uploading to Drive:", error);
      throw error;
    }
  }

  private async clearMainSheet(): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) return;

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: "Sheet1!A1:L1",
      });

      const headers = response.data.values?.[0] || [];

      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: "Sheet1!A:L",
      });

      if (headers.length > 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: "Sheet1!A1:L1",
          valueInputOption: "RAW",
          requestBody: {
            values: [headers],
          },
        });
      }

      console.log("Main sheet cleared, headers preserved");
    } catch (error) {
      console.error("Error clearing main sheet:", error);
      throw error;
    }
  }

  private async logBackup(entry: BackupLogEntry): Promise<void> {
    if (!this.sheets || !this.spreadsheetId) return;

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: "Backup Log!A:D",
        valueInputOption: "RAW",
        requestBody: {
          values: [[
            entry.timestamp,
            entry.filename,
            entry.driveLink,
            entry.rowCount.toString(),
          ]],
        },
      });

      console.log("Backup logged to Backup Log sheet");
    } catch (error) {
      console.error("Error logging backup:", error);
    }
  }


  async performBackup(): Promise<void> {
    if (this.isBackupInProgress) {
      console.log("Backup already in progress, skipping...");
      return;
    }

    if (!this.sheets || !this.spreadsheetId || !this.drive) {
      console.log("Backup service not configured");
      return;
    }

    this.isBackupInProgress = true;

    try {
      const rowCount = await this.getRowCount();
      console.log(`Current row count: ${rowCount}`);

      if (rowCount <= 1) {
        console.log("No data to backup (only headers or empty)");
        this.isBackupInProgress = false;
        return;
      }

      const timestamp = new Date();
      const filename = `mute-log-${this.formatTimestamp(timestamp)}.csv`;
      
      console.log("Starting backup process...");
      
      const csvContent = await this.exportToCsv();
      console.log("CSV export complete");
      
      const driveLink = await this.uploadToDrive(csvContent, filename);
      console.log("Upload to Drive complete");
      
      await this.clearMainSheet();
      console.log("Main sheet cleared");
      
      await this.logBackup({
        timestamp: timestamp.toISOString(),
        filename,
        driveLink,
        rowCount: rowCount - 1,
      });
      
      this.messageCounter = 0;
      
      console.log(`✅ Backup completed successfully: ${filename}`);
    } catch (error) {
      console.error("❌ Backup failed:", error);
    } finally {
      this.isBackupInProgress = false;
    }
  }

  async checkAndBackup(): Promise<void> {
    try {
      const rowCount = await this.getRowCount();
      
      if (rowCount > this.BACKUP_THRESHOLD) {
        console.log(`Row count (${rowCount}) exceeds threshold (${this.BACKUP_THRESHOLD}), triggering backup...`);
        await this.performBackup();
      }
    } catch (error) {
      console.error("Error in checkAndBackup:", error);
    }
  }

  notifyMessageLogged(): void {
    this.messageCounter++;
    
    if (this.messageCounter >= this.MESSAGE_CHECK_INTERVAL) {
      console.log(`${this.MESSAGE_CHECK_INTERVAL} messages logged, checking if backup needed...`);
      this.messageCounter = 0;
      this.checkAndBackup().catch(console.error);
    }
  }

  private startScheduler(): void {
    cron.schedule("0 * * * *", () => {
      console.log("Hourly backup check triggered");
      this.checkAndBackup().catch(console.error);
    });

    console.log("Backup scheduler started (hourly checks)");
  }

  private formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    
    return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
  }
}

export const sheetsBackupService = new SheetsBackupService();

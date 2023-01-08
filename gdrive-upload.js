import { google } from "googleapis";
import fetch from "node-fetch";
import mime from "mime-types";
import crypto from "crypto";
import * as fs from "fs";


class GDriveUploader {
    // consts and vars
    DOWNLOAD_DIR = "./downloads";
    G_DRIVE_FOLDER_ID = process.env.G_DRIVE_FOLDER_ID || "1tR0r3gEMsACD6WPeuubupfxOgB9gA5mz";
    DESCRIPTION = "Uploaded By Gdrive-Uploader";
    SCOPES = ["https://www.googleapis.com/auth/drive"];
    auth;
    drive;

    constructor() {
        if (process.env.CREDS) {            
            this.auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.CREDS), scopes: this.SCOPES });
        } else {
            this.auth = new google.auth.GoogleAuth({ keyFile: "creds.json", scopes: this.SCOPES });
        }
        this.drive = google.drive({ version: "v3", auth: this.auth });
    }

    // get local file path from file name
    getFilePath(fileName) {
        return this.DOWNLOAD_DIR + "/" + fileName;
    }

    // delete file from Disk
    deleteFileFromDisk(fileName, opts = {}) {
        if (opts.onDeleteStarted) {
            opts.onDeleteStarted();
        }

        const filePath = this.getFilePath(fileName);
        if (fs.existsSync && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        if (opts.onDeleteFinished) {
            opts.onDeleteFinished();
        }
    }

    // get file info from url
    async getFileInfo(fileUrl) {
        let response = await fetch(fileUrl, { method: "HEAD" });
        if (!response.ok) {
            if (response.status !== 405) {
                throw new Error(`Unexpected Response: ${response.statusText}`);
            }

            // if 405, try again with GET and abort after headers
            const abortController = new AbortController();
            response = await fetch(fileUrl, {
                method: "GET",
                signal: abortController.signal,
                headers: {
                    Range: "bytes=0-",
                },
            });
            if (!response.ok) {
                throw new Error(`Unexpected Response: ${response.statusText}`);
            }
            abortController.abort();
        }
        // console.log(response.headers.raw()); // print headers

        const fileName =
            response.headers.get("content-disposition")?.split("=").pop() ||
            fileUrl.split("/")?.pop() ||
            Date.now();
        const fileType = response.headers.get("content-type");
        const fileSize =
            response.headers.get("content-length") ||
            response.headers.get("content-range")?.split("/").pop();
        return { fileName, fileType, fileSize };
    }

    // download file from url and save to disk
    async saveFileToDisk(fileUrl, fileName, opts = {}) {
        if (opts.onDownloadStarted) {
            opts.onDownloadStarted();
        }

        const response = await fetch(fileUrl, { signal: opts.signal });
        if (!response.ok) {
            throw new Error(`Unexpected Response: ${response.statusText}`);
        }

        // if directory doesn't exist, create it
        if (!fs.existsSync(this.DOWNLOAD_DIR)) {
            fs.mkdirSync(this.DOWNLOAD_DIR);
        }

        const filePath = this.getFilePath(fileName);
        const fileStream = fs.createWriteStream(filePath);
        response.body.pipe(fileStream);
        let current = 0;

        await new Promise((resolve, reject) => {
            response.body.on("data", (chunk) => {
                if (opts.onDownloadProgress) {
                    current += chunk.length;
                    opts.onDownloadProgress(current, opts.fileSize);
                }
            });
            response.body.on("error", (err) => {
                if (opts.onDownloadError) {
                    opts.onDownloadError(err);
                }
                reject(err);
            });
            fileStream.on("finish", function () {
                if (opts.onDownloadEnded) {
                    opts.onDownloadEnded();
                }
                resolve();
            });
        });
    }

    // upload file to Google Drive 
    async saveFileToDrive(fileName, fileType, opts = {}) {
        if (opts.onUploadStarted) {
            opts.onUploadStarted();
        }

        const filePath = this.getFilePath(fileName);
        const fileStream = fs.createReadStream(filePath);
        // get file size
        try {
            let current = 0;
            const response = await this.drive.files.create({
                supportsAllDrives: true,
                requestBody: {
                    name: fileName,
                    mimeType: fileType,
                    parents: [this.G_DRIVE_FOLDER_ID],
                    description: this.DESCRIPTION,
                },
                media: {
                    mimeType: fileType,
                    body: fileStream,
                },
            }, {
                onUploadProgress: (progress) => {
                    if (opts.onUploadProgress) {
                        current = progress.bytesRead;
                        opts.onUploadProgress(current, opts.fileSize);
                    }
                },
                signal: opts.signal,
            });
            if (opts.onUploadEnded) {
                opts.onUploadEnded();
            }
            return response.data.id;
        } catch (error) {
            if (opts.onUploadError) {
                opts.onUploadError(error);
            }
            throw error;
        }
    }

    // upload file to Google Drive
    async upload(fileUrl, opts = {}) {
        const fileInfo = await this.getFileInfo(fileUrl);
        opts.fileName = opts.fileName || fileInfo.fileName;
        opts.fileType = opts.fileType || fileInfo.fileType;
        opts.fileSize = opts.fileSize || fileInfo.fileSize;

        try {
            await this.saveFileToDisk(fileUrl, opts.fileName, opts);
            const fileId = await this.saveFileToDrive(opts.fileName, opts.fileType, opts);
            return fileId;
        } finally {
            this.deleteFileFromDisk(opts.fileName, opts);
        }
    }
}



// const uploader = new GDriveUploader();
// uploader.upload("http://212.183.159.230/20MB.zip", {
//     onDownloadStarted: () => console.log("Download started"),
//     onDownloadProgress: (current, total) => console.log(`Download progress: ${(current / total) * 100} %`),
//     onDownloadEnded: () => console.log("Download ended"),
//     onUploadStarted: () => console.log("Upload started"),
//     onUploadProgress: (current, total) => console.log(`Upload progress: ${(current / total) * 100} %`),
//     onUploadEnded: () => console.log("Upload ended"),
//     onDeleteStarted: () => console.log("File Deleting"),
//     onDeleteFinished: () => console.log("File Deleted"),
// });


export default GDriveUploader;
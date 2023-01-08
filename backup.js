import { google } from "googleapis";
import fetch from "node-fetch";
import mime from "mime-types";
import crypto from "crypto";
import * as fs from "fs";


// consts and vars
const DOWNLOAD_DIR = "./downloads";
const G_DRIVE_FOLDER_IDS = ["1tR0r3gEMsACD6WPeuubupfxOgB9gA5mz"];
const DESCRIPTION = "Uploaded By Gdrive-Uploader";
const SCOPES = ["https://www.googleapis.com/auth/drive"];



// auth from "creds.json" for service account
const auth = new google.auth.GoogleAuth({ keyFile: "creds.json", scopes: SCOPES });
const drive = google.drive({ version: "v3", auth: auth });

// get local file path from file name
function getFilePath(fileName) {
    return DOWNLOAD_DIR + "/" + fileName;
}

// get file info from url
async function getFileInfo(fileUrl) {
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
                "Range": "bytes=0-",
            }
        });
        if (!response.ok) {
            throw new Error(`Unexpected Response: ${response.statusText}`);
        }
        abortController.abort();
    }
    // console.log(response.headers.raw()); // print headers

    const fileName = response.headers.get("content-disposition")?.split("=").pop() || fileUrl.split("/")?.pop() || Date.now();
    const fileType = response.headers.get("content-type");
    const fileSize = response.headers.get("content-length") || response.headers.get("content-range")?.split("/").pop();
    return { fileName, fileType, fileSize };
}


// download file from url and save to disk
async function saveFileToDisk(fileUrl, fileName, opts = {}) {
    const response = await fetch(fileUrl, { signal: opts.signal });
    if (!response.ok) {
        throw new Error(`Unexpected Response: ${response.statusText}`);
    }

    // if directory doesn't exist, create it
    if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR);
    }

    const filePath = getFilePath(fileName);
    const fileStream = fs.createWriteStream(filePath);
    await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on("error", (err) => {
            reject(err);
        });
        fileStream.on("finish", function () {
            resolve();
        });
    });
}

// upload file to Google Drive 
async function saveFileToDrive(fileName, fileType, opts = {}) {
    const filePath = getFilePath(fileName);
    const fileStream = fs.createReadStream(filePath);
    try {
        const response = await drive.files.create({
            supportsAllDrives: true,
            requestBody: {
                name: fileName,
                mimeType: fileType,
                parents: G_DRIVE_FOLDER_IDS,
                description: DESCRIPTION
            },
            media: {
                mimeType: fileType,
                body: fileStream
            }
        }, {
            onUploadProgress: (progress) => {
                if (opts.onProgress) {
                    opts.onProgress(progress);
                }
            },
            signal: opts.signal
        });
        return response.data.id;
    } catch (err) {
        // close filestream
        fileStream.close();
        throw err;
    }
}

export async function upload(fileUrl, opts = {}) {
    let { fileName, fileType, fileSize, signal, onUploadProgress } = opts;
    const uId = crypto.randomBytes(16).toString("hex");
    console.log(uId, " : ", fileUrl);

    const fileInfo = await getFileInfo(fileUrl);
    fileName = fileName || fileInfo.fileName || fileUrl.split("/").pop();
    fileType = fileType || fileInfo.fileType || mime.lookup(fileName) || "application/octet-stream";
    fileSize = fileSize || fileInfo.fileSize;
    console.log(uId, " : ", `File Info: `, JSON.stringify({ fileName, fileType, fileSize }));
    if (!fileName || !fileType) {
        throw new Error("File Info: Missing file info");
    }

    try {
        console.log(uId, " : ", "Downloading...");
        opts?.onDownload();
        await saveFileToDisk(fileUrl, fileName, {
            signal: signal
        });
        console.log(uId, " : ", "Downloaded");


        console.log(uId, " : ", "Uploading...");
        opts?.onUpload();
        await saveFileToDrive(fileName, fileType, {
            signal: signal,
            onProgress: onUploadProgress
        });
        console.log(uId, " : ", "Uploaded");


        console.log(uId, " : ", "Deleting File...");
        const filePath = getFilePath(fileName);
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
        console.log(uId, " : ", "Deleted");

    } catch (err) {

        if (err.name === "AbortError" || err.type === "aborted") {
            console.log(uId, " : ", "Aborted");
        }

        console.log(uId, " : ", "Deleting File...");
        const filePath = getFilePath(fileName);
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
        console.log(uId, " : ", "Deleted");

        throw err;
    }
}





async function main() {
    const fileUrls = [
        "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png",
        "http://212.183.159.230/5MB.zip",
        "https://www.dundeecity.gov.uk/sites/default/files/publications/civic_renewal_forms.zip",
        "https://tor-dl.onrender.com/download/Best%20Self_%20Be%20You,%20Only%20Better%20by%20Mike%20Bayer%20EPUB/Best%20Self_%20Be%20You,%20Only%20Better%20by%20Mike%20Bayer.epub",
        "https://tor-dl.onrender.com/download/Best%20Self_%20Be%20You,%20Only%20Better%20by%20Mike%20Bayer%20EPUB",
    ]

    for (const fileUrl of fileUrls) {
        const abortController = new AbortController();
        setTimeout(() => {
            abortController.abort();
        }, 5000);

        try {
            await upload(fileUrl, {
                signal: abortController.signal,
            });
        } catch (error) {
            if (error.type === "aborted") {
            }
        }
        console.log("\n", "-".repeat(80), "\n");
    }
}

// main();
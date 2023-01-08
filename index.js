import GDriveUploader from "./gdrive-upload.js";
import { Telegraf } from "telegraf";

const bot = new Telegraf("1475260552:AAH7xHlLIWb7j_R_sb5sb1uxcSTCuslVIX4");
const uploadQueue = {};

// Handler Functions
function startHandler(ctx) {
    // send with a brief description of the bot and its commands
    ctx.reply(
        "Hi, I am a Google Drive Uploader Bot. I can upload files to your Google Drive.\n\n" +
        "<i>Send me a file url to upload it to your Google Drive.</i>\n" +
        "<code>/upload https://example.com/file.mp4</code>\n\n" +
        "<i>You can also send me a file url with a custom file name and file type.</i>\n" +
        "<code>/upload https://example.com/file.mp4 file.mp4 video/mp4</code>\n\n" +
        "<i>You can also send me a file url with a custom file name, file type and file size.</i>\n" +
        "<code>/upload https://example.com/file.mp4 file.mp4 video/mp4 34342343</code>\n\n", {
        parse_mode: "HTML",
    });
}

async function uploadHandler(ctx) {
    // /upload https://example.com/file.mp4 file.mp4 video/mp4 34342343
    let [cmd, fileUrl, fileName, fileType, fileSize] = ctx.message.text.split(" ").map((x) => x?.trim());
    if (!fileUrl) {
        return ctx.reply("Please send a file url.");
    }

    const uId = `${ctx.chat.id}_${ctx.message.message_id}`;
    const abortController = new AbortController();
    uploadQueue[uId] = abortController;

    // reply with processing message
    const msg = await ctx.reply("Processing...", {
        reply_markup: {
            inline_keyboard: [[{ text: "Abort", callback_data: `abort-${uId}` }]]
        },
        reply_to_message_id: ctx.message.message_id
    });

    const getMsg = (info) => {
        let msg = `<b>File Url :</b>\n` + info.fileUrl + `\n\n<b>Status :</b>\n`;
        if (info.fileDlStatus) {
            msg += "<code>Downloading... " + info.fileDlProgress + " %</code>\n";
        }
        if (info.fileUpStatus) {
            msg += "<code>Uploading... " + info.fileUpProgress + " %</code>\n";
        }
        return msg;
    }
    const statusInfo = {
        fileUrl: fileUrl, fileDlStatus: false,
        fileDlProgress: 0, fileUpStatus: false,
        fileUpProgress: 0, fileDeleteStatus: false, fileId: null
    }

    const interval = setInterval(() => {
        ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, getMsg(statusInfo), {
            reply_markup: {
                inline_keyboard: [[{ text: "Abort", callback_data: `abort-${uId}` }]]
            },
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_to_message_id: ctx.message.message_id
        })
            .catch((err) => console.log(err.message));
    }, 2000);

    // upload file
    const uploader = new GDriveUploader();
    uploader.upload(fileUrl, {
        fileName: fileName,
        fileType: fileType,
        fileSize: fileSize,
        signal: abortController.signal,
        onDownloadStarted: () => {
            statusInfo.fileDlStatus = true;
        },
        onDownloadProgress: (current, total) => {
            statusInfo.fileDlProgress = (current / total) * 100;
        },
        onUploadStarted: () => {
            statusInfo.fileUpStatus = true;
        },
        onUploadProgress: (current, total) => {
            statusInfo.fileUpProgress = (current / total) * 100;
        },
        onDeleteEnded: () => {
            statusInfo.fileDeleteStatus = true;
        }
    })
        .then((fileId) => {
            clearInterval(interval);
            // ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
            ctx.reply(`File Uploaded Successfully: \nhttps://drive.google.com/file/d/${fileId}/view`, {
                reply_to_message_id: msg.message_id
            });
        })
        .catch((err) => {
            clearInterval(interval);
            if (err.name === "AbortError") {
                ctx.reply("Upload Aborted !", { reply_to_message_id: msg.message_id });
            } else {
                ctx.reply(`Error: \n${err.message}`, { reply_to_message_id: msg.message_id });
            }
        }).finally(() => {
            delete uploadQueue[uId];
        });
}

function abortHandler(ctx) {
    const uId = ctx.update.callback_query.data.split("-")[1];
    if (uploadQueue[uId]) {
        uploadQueue[uId].abort();
    }
}

// Register Bot Commands
bot.command('start', startHandler);
bot.command('upload', uploadHandler);
bot.action(/abort-.*/, abortHandler);

// register bot commands
bot.telegram.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'upload', description: 'Upload a file' }
])
    .then(() => console.log("Commands registered successfully !"))
    .catch((err) => console.log("Commands Registration Failed", err.message));

// Start the bot
bot.launch();


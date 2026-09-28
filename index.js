// --- BẮT LỖI TOÀN CỤC ĐỂ CHỐNG SẬP BOT ---
process.on('uncaughtException', (err) => {
    console.error('Lỗi ngoại lệ chưa được bắt (Đã bỏ qua để không sập bot):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Lỗi Promise chưa được xử lý (Đã bỏ qua để không sập bot):', reason);
});

const { Client: DiscordBotClient, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- HÀM HỖ TRỢ QUÉT THƯ MỤC DOWNLOAD TRÊN CLOUD ---
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a'];

function getDownloadDirectories() {
    return [
        path.join(process.cwd(), 'Download'),
        process.cwd()
    ];
}

function getLocalMusicFiles() {
    let filesList = [];
    const dirs = getDownloadDirectories();

    for (const dir of dirs) {
        try {
            if (fs.existsSync(dir) && fs.lstatSync(dir).isDirectory()) {
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const ext = path.extname(item).toLowerCase();
                    if (AUDIO_EXTENSIONS.includes(ext)) {
                        if (!filesList.includes(item)) {
                            filesList.push(item);
                        }
                    }
                }
            }
        } catch (e) {}
    }
    return filesList;
}

function findSongFile(fileName) {
    const dirs = getDownloadDirectories();
    for (const dir of dirs) {
        const fullPath = path.join(dir, fileName);
        if (fs.existsSync(fullPath)) return fullPath;
    }
    if (fs.existsSync(fileName)) return fileName;
    return null;
}

// --- 1. WORKER AUDIO (Phát nhạc - Chức năng 1) ---
if (process.argv[2] === '_worker_audio') {
    const workerToken = process.argv[3];
    const targetChannelId = process.argv[4];
    const songFileName = process.argv[5] || 'song.mp3';
    const volumeInput = process.argv[6] || 100;

    let filePath = findSongFile(songFileName);
    if (!filePath) process.exit(1);

    const workerClient = new SelfClient({ checkUpdate: false });
    workerClient.once('ready', async () => {
        try {
            const channel = await workerClient.channels.fetch(targetChannelId);
            if (!channel || (channel.type !== 'GUILD_VOICE' && channel.type !== 'GUILD_STAGE_VOICE')) return;

            const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: true
            });

            let rawVol = parseFloat(volumeInput);
            if (isNaN(rawVol)) rawVol = 100;
            if (rawVol < 0) rawVol = 0;
            if (rawVol > 10000000) rawVol = 10000000;

            const parsedVolume = rawVol / 100;
            const resource = createAudioResource(filePath, { inlineVolume: true });
            resource.volume.setVolume(parsedVolume);

            const player = createAudioPlayer();
            player.on('idle', () => {
                const loopResource = createAudioResource(filePath, { inlineVolume: true });
                loopResource.volume.setVolume(parsedVolume);
                player.play(loopResource);
            });

            player.play(resource);
            connection.subscribe(player);
        } catch (error) {}
    });
    workerClient.login(workerToken).catch(() => {});
    return;
}

// --- 2. WORKER TREO ROOM FULL TÙY CHỌN (Chức năng 2 - Mic, Deaf, Stream, Cam) ---
if (process.argv[2] === '_worker_treo') {
    const workerToken = process.argv[3];
    const targetChannelId = process.argv[4];
    const selfMute = process.argv[5] === 'true';
    const selfDeaf = process.argv[6] === 'true';
    const enableStreamCam = process.argv[7] === 'true';

    const startTreoWorker = () => {
        const treoClient = new SelfClient({ checkUpdate: false });
        
        treoClient.once('ready', async () => {
            try {
                const channel = await treoClient.channels.fetch(targetChannelId);
                if (!channel || (channel.type !== 'GUILD_VOICE' && channel.type !== 'GUILD_STAGE_VOICE')) {
                    process.exit(1);
                }

                const { joinVoiceChannel } = require('@discordjs/voice');
                const connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: channel.guild.id,
                    adapterCreator: channel.guild.voiceAdapterCreator,
                    selfMute: selfMute,
                    selfDeaf: selfDeaf
                });

                const keepAliveInterval = setInterval(() => {
                    try {
                        if (connection) {
                            connection.setSpeaking(true);
                            
                            if (enableStreamCam && typeof treoClient.ws?.send === 'function') {
                                treoClient.ws.send({
                                    op: 18,
                                    d: {
                                        type: 'guild',
                                        guild_id: channel.guild.id,
                                        channel_id: channel.id,
                                        preferred_region: channel.guild.preferredRegion || 'singapore'
                                    }
                                }).catch(() => {});

                                treoClient.ws.send({
                                    op: 4,
                                    d: {
                                        guild_id: channel.guild.id,
                                        channel_id: channel.id,
                                        self_mute: selfMute,
                                        self_deaf: selfDeaf,
                                        self_video: true
                                    }
                                }).catch(() => {});
                            }
                        }
                    } catch (e) {}
                }, 15000);

                connection.on('error', (err) => {
                    clearInterval(keepAliveInterval);
                    try { treoClient.destroy(); } catch (e) {}
                    setTimeout(startTreoWorker, 5000);
                });

                treoClient.on('disconnect', () => {
                    clearInterval(keepAliveInterval);
                    setTimeout(startTreoWorker, 5000);
                });

            } catch (error) {
                setTimeout(startTreoWorker, 10000);
            }
        });

        treoClient.login(workerToken).catch(() => {
            setTimeout(startTreoWorker, 10000);
        });
    };

    startTreoWorker();
    return;
}

// --- 3. WORKER SPAM NỘI DUNG (Chức năng 4) ---
if (process.argv[2] === '_worker_spam') {
    const workerToken = process.argv[3];
    const targetChannelId = process.argv[4];
    const delayMs = parseInt(process.argv[5]) || 2000;

    const spamClient = new SelfClient({ checkUpdate: false });
    spamClient.once('ready', async () => {
        try {
            const channel = await spamClient.channels.fetch(targetChannelId);
            if (!channel || !channel.isText()) process.exit(1);

            const sendLoop = async () => {
                try {
                    if (fs.existsSync('noidung.txt')) {
                        let rawContent = fs.readFileSync('noidung.txt', 'utf-8').trim();
                        if (rawContent.length > 0) {
                            if (typeof channel.sendTyping === 'function') {
                                await channel.sendTyping().catch(() => {});
                            }
                            await channel.send({ content: rawContent });
                        }
                    }
                } catch (err) {}
                setTimeout(sendLoop, delayMs);
            };
            sendLoop();
        } catch (e) { process.exit(1); }
    });
    spamClient.login(workerToken).catch(() => {});
    return;
}

// --- WORKER SPAM NỘI DUNG NHẬP TRỰC TIẾP (Chức năng 9) ---
if (process.argv[2] === '_worker_spam_custom') {
    const workerToken = process.argv[3];
    const targetChannelId = process.argv[4];
    const spamMessage = process.argv[5] || 'Spam message';
    const delaySeconds = parseFloat(process.argv[6]) || 2;
    const delayMs = delaySeconds * 1000;

    const spamCustomClient = new SelfClient({ checkUpdate: false });
    spamCustomClient.once('ready', async () => {
        try {
            const channel = await spamCustomClient.channels.fetch(targetChannelId);
            if (!channel || !channel.isText()) process.exit(1);

            const sendLoop = async () => {
                try {
                    if (spamMessage.length > 0) {
                        if (typeof channel.sendTyping === 'function') {
                            await channel.sendTyping().catch(() => {});
                        }
                        await channel.send({ content: spamMessage });
                    }
                } catch (err) {}
                setTimeout(sendLoop, delayMs);
            };
            sendLoop();
        } catch (e) { process.exit(1); }
    });
    spamCustomClient.login(workerToken).catch(() => {});
    return;
}

// --- 4. WORKER CHỬI TAG ID (Chức năng 5) ---
if (process.argv[2] === '_worker_tagspam') {
    const workerToken = process.argv[3];
    const targetChannelId = process.argv[4];
    const rawTargetUserIds = process.argv[5] || '';
    const delaySeconds = parseFloat(process.argv[6]) || 2;
    const delayMs = delaySeconds * 1000;

    const userIds = rawTargetUserIds.split(',').map(id => id.trim()).filter(id => id.length > 0);

    const tagClient = new SelfClient({ checkUpdate: false });
    tagClient.once('ready', async () => {
        try {
            const channel = await tagClient.channels.fetch(targetChannelId);
            if (!channel || !channel.isText()) process.exit(1);

            let index = 0;
            const sendLoop = async () => {
                try {
                    const filePath = path.join(process.cwd(), 'ngontu chui.txt');
                    if (fs.existsSync(filePath)) {
                        let fileContent = fs.readFileSync(filePath, 'utf-8');
                        let lines = fileContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                        
                        if (lines.length > 0) {
                            let currentLine = lines[index % lines.length];
                            let tagString = '';
                            if (userIds.length > 0) {
                                const currentId = userIds[index % userIds.length];
                                tagString = `<@${currentId}> `;
                            }
                            const finalMessage = `# ${tagString}${currentLine}`;
                            
                            if (typeof channel.sendTyping === 'function') {
                                await channel.sendTyping().catch(() => {});
                            }
                            await channel.send({ content: finalMessage });
                            index++;
                        }
                    }
                } catch (err) {}
                setTimeout(sendLoop, delayMs);
            };
            sendLoop();
        } catch (e) { process.exit(1); }
    });
    tagClient.login(workerToken).catch(() => {});
    return;
}

// --- 5. WORKER NHÂY CÓ TAG (Chức năng 6) ---
if (process.argv[2] === '_worker_nhay') {
    const workerToken = process.argv[3];
    const targetChannelId = process.argv[4];
    const rawTargetUserIds = process.argv[5] || '';
    const delaySeconds = parseFloat(process.argv[6]) || 2;
    const delayMs = delaySeconds * 1000;

    const userIds = rawTargetUserIds.split(',').map(id => id.trim()).filter(id => id.length > 0);

    const nhayClient = new SelfClient({ checkUpdate: false });
    nhayClient.once('ready', async () => {
        try {
            const channel = await nhayClient.channels.fetch(targetChannelId);
            if (!channel || !channel.isText()) process.exit(1);

            let index = 0;
            const sendLoop = async () => {
                try {
                    const possibleFiles = ['văn-bản.txt', 'nano nhay.txt', 'nhay.txt'];
                    let filePath = null;
                    for (const f of possibleFiles) {
                        if (fs.existsSync(f)) { filePath = f; break; }
                    }

                    if (filePath) {
                        let fileContent = fs.readFileSync(filePath, 'utf-8');
                        let lines = fileContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                        
                        if (lines.length > 0) {
                            let currentLine = lines[index % lines.length];
                            if (currentLine.startsWith('#')) {
                                currentLine = currentLine.replace(/^#\s*/, '');
                            }

                            let tagString = '';
                            if (userIds.length > 0) {
                                const currentId = userIds[index % userIds.length];
                                tagString = `<@${currentId}> `;
                            }

                            let combinedText = `${tagString}${currentLine}`;
                            const finalMessage = `# ${combinedText}`;
                            
                            if (typeof channel.sendTyping === 'function') {
                                await channel.sendTyping().catch(() => {});
                            }
                            await channel.send({ content: finalMessage });
                            index++;
                        }
                    }
                } catch (err) {}
                setTimeout(sendLoop, delayMs);
            };
            sendLoop();
        } catch (e) { process.exit(1); }
    });
    nhayClient.login(workerToken).catch(() => {});
    return;
}

// --- 6. WORKER RAID (Chức năng 7) ---
if (process.argv[2] === '_worker_raid') {
    const workerToken = process.argv[3];
    const targetChannelId = process.argv[4];
    const delaySeconds = parseFloat(process.argv[5]) || 0.5;
    const delayMs = delaySeconds * 1000;

    const raidClient = new SelfClient({ checkUpdate: false });
    raidClient.once('ready', async () => {
        try {
            const channel = await raidClient.channels.fetch(targetChannelId);
            if (!channel || !channel.isText()) process.exit(1);

            let index = 0;
            const raidLoop = async () => {
                try {
                    const possibleFiles = ['nano raid.txt', 'raid.txt', 'văn-bản.txt'];
                    let filePath = null;
                    for (const f of possibleFiles) {
                        if (fs.existsSync(f)) { filePath = f; break; }
                    }

                    if (filePath) {
                        let fileContent = fs.readFileSync(filePath, 'utf-8');
                        let lines = fileContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                        
                        if (lines.length > 0) {
                            let batchLines = [];
                            for (let i = 0; i < 5; i++) {
                                batchLines.push(lines[(index + i) % lines.length]);
                            }
                            
                            let combinedText = batchLines.join('\n');
                            const finalMessage = combinedText.startsWith('#') ? combinedText : `# ${combinedText}`;
                            
                            if (typeof channel.sendTyping === 'function') {
                                await channel.sendTyping().catch(() => {});
                            }
                            await channel.send({ content: finalMessage });
                            index = (index + 5) % lines.length;
                        }
                    }
                } catch (err) {}
                setTimeout(raidLoop, delayMs);
            };
            raidLoop();
        } catch (e) { process.exit(1); }
    });
    raidClient.login(workerToken).catch(() => {});
    return;
}

// --- 7. WORKER LẤY TOKEN TỪ TÀI KHOẢN MẬT KHẨU (Chức năng 8) ---
if (process.argv[2] === '_worker_gettoken') {
    const email = process.argv[3];
    const password = process.argv[4];
    const requesterId = process.argv[5];

    const tempClient = new SelfClient({ checkUpdate: false });
    tempClient.once('ready', async () => {
        try {
            const token = tempClient.token;
            console.log(`__TOKEN_RESULT__:${requesterId}:${token}`);
        } catch (e) {}
        process.exit(0);
    });

    tempClient.login(email, password).catch((err) => {
        console.log(`__TOKEN_ERROR__:${requesterId}:${err.message}`);
        process.exit(1);
    });
    return;
}

// --- WORKER CHECK TOKEN (Chức năng 10) ---
if (process.argv[2] === '_worker_checktoken') {
    const tokensString = process.argv[3] || '';
    const requesterId = process.argv[4];
    const tokens = tokensString.split(',').map(t => t.trim()).filter(t => t.length > 0);

    let results = [];
    let completed = 0;

    if (tokens.length === 0) {
        console.log(`__CHECK_RESULT__:${requesterId}:Không có token nào được cung cấp.`);
        process.exit(0);
    }

    tokens.forEach((token, index) => {
        let checkClient;
        try {
            checkClient = new SelfClient({ checkUpdate: false });
        } catch (e) {
            results[index] = `Token ${index + 1}: ❌ **DIE / Lỗi khởi tạo**`;
            checkCompleted();
            return;
        }

        let resolved = false;
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                results[index] = `Token ${index + 1}: ❌ **DIE / Timeout**`;
                try { checkClient.destroy(); } catch (err) {}
                checkCompleted();
            }
        }, 10000);

        checkClient.once('ready', () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                try {
                    const tag = checkClient.user ? (checkClient.user.tag || checkClient.user.username) : 'Live';
                    results[index] = `Token ${index + 1}: ✅ **LIVE** (${tag})`;
                } catch (e) {
                    results[index] = `Token ${index + 1}: ✅ **LIVE**`;
                }
                try { checkClient.destroy(); } catch (err) {}
                checkCompleted();
            }
        });

        checkClient.login(token).catch(() => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                results[index] = `Token ${index + 1}: ❌ **DIE**`;
                checkCompleted();
            }
        });
    });

    function checkCompleted() {
        completed++;
        if (completed === tokens.length) {
            console.log(`__CHECK_RESULT__:${requesterId}:${JSON.stringify(results)}`);
            process.exit(0);
        }
    }
    return;
}

// --- WORKER JOIN SERVER BẰNG MÃ/LINK MỜI TRỰC TIẾP ---
if (process.argv[2] === '_worker_jointoken_server') {
    const workerToken = process.argv[3];
    const inviteInput = process.argv[4];
    const requesterId = process.argv[5];
    const tokenIndex = process.argv[6];

    let inviteCode = inviteInput.trim();
    if (inviteCode.includes('discord.gg/')) {
        inviteCode = inviteCode.split('discord.gg/')[1].split('?')[0];
    } else if (inviteCode.includes('discord.com/invites/')) {
        inviteCode = inviteCode.split('discord.com/invites/')[1].split('?')[0];
    }

    const joinClient = new SelfClient({ checkUpdate: false });
    
    let isFinished = false;
    const timer = setTimeout(() => {
        if (!isFinished) {
            isFinished = true;
            console.log(`__JOIN_RESULT__:${requesterId}:Token${tokenIndex}: ❌ **Thất bại (Timeout)**`);
            try { joinClient.destroy(); } catch (e) {}
            process.exit(0);
        }
    }, 15000);

    joinClient.once('ready', async () => {
        try {
            let inviteObj = null;
            if (typeof joinClient.fetchInvite === 'function') {
                inviteObj = await joinClient.fetchInvite(inviteCode).catch(() => null);
            }

            if (inviteObj && typeof inviteObj.accept === 'function') {
                await inviteObj.accept();
            } else {
                await joinClient.api.invites(inviteCode).post().catch(() => {});
            }

            if (!isFinished) {
                isFinished = true;
                clearTimeout(timer);
                console.log(`__JOIN_RESULT__:${requesterId}:Token${tokenIndex}: ✅ **Thành công**`);
                try { joinClient.destroy(); } catch (e) {}
                process.exit(0);
            }
        } catch (e) {
            if (!isFinished) {
                isFinished = true;
                clearTimeout(timer);
                console.log(`__JOIN_RESULT__:${requesterId}:Token${tokenIndex}: ❌ **Thất bại (${e.message})**`);
                try { joinClient.destroy(); } catch (e) {}
                process.exit(0);
            }
        }
    });

    joinClient.login(workerToken).catch(() => {
        if (!isFinished) {
            isFinished = true;
            clearTimeout(timer);
            console.log(`__JOIN_RESULT__:${requesterId}:Token${tokenIndex}: ❌ **Thất bại (Sai token hoặc DIE)**`);
            process.exit(0);
        }
    });
    return;
}

// --- WORKER ĐỔI AVATAR BẰNG TOKEN (Chức năng 12) ---
if (process.argv[2] === '_worker_setavatar') {
    const workerToken = process.argv[3];
    const imageUrl = process.argv[4];
    const requesterId = process.argv[5];

    const avatarClient = new SelfClient({ checkUpdate: false });
    avatarClient.once('ready', async () => {
        try {
            await avatarClient.user.setAvatar(imageUrl);
            console.log(`__AVATAR_RESULT__:${requesterId}:Token${workerToken.substring(0, 10)}...: ✅ **Đổi avatar thành công!**`);
        } catch (err) {
            console.log(`__AVATAR_RESULT__:${requesterId}:Token ${workerToken.substring(0, 10)}...: ❌ **Lỗi:** ${err.message}`);
        }
        process.exit(0);
    });

    avatarClient.login(workerToken).catch(() => {
        console.log(`__AVATAR_RESULT__:${requesterId}:Token${workerToken.substring(0, 10)}...: ❌ **Đăng nhập thất bại (DIE)**`);
        process.exit(1);
    });
    return;
}

// --- DISCORD BOT PANEL CHÍNH ---
const botClient = new DiscordBotClient({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages]
});

const OWNER_ID = '1509063488545226862';
const WHITELIST_FILE = 'whitelist.json';

function getWhitelist() {
    try {
        if (fs.existsSync(WHITELIST_FILE)) {
            const data = fs.readFileSync(WHITELIST_FILE, 'utf-8');
            const list = JSON.parse(data);
            if (Array.isArray(list) && !list.includes(OWNER_ID)) list.push(OWNER_ID);
            return list;
        }
    } catch (e) {}
    return [OWNER_ID];
}

function saveWhitelist(list) {
    try {
        fs.writeFileSync(WHITELIST_FILE, JSON.stringify(list, null, 2));
    } catch (e) {}
}

function hasPermission(userId) {
    const list = getWhitelist();
    return list.includes(userId);
}

const activeWorkers = new Map(); 
const pendingJoinSessions = new Map();
const userTokenCache = new Map();
const userInviteCache = new Map();

botClient.on('ready', () => {
    console.log(`[🤖] Panel Bot Bùi Đức Huy VIP đã online: ${botClient.user.tag}`);
});

botClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (!message.guild) {
        const userId = message.author.id;
        if (pendingJoinSessions.has(userId)) {
            const step = pendingJoinSessions.get(userId);
            
            if (step === 'WAITING_TOKENS') {
                const tokens = message.content.split(/\r?\n/).map(t => t.trim()).filter(t => t.length > 0);
                if (tokens.length > 0) {
                    userTokenCache.set(userId, tokens);
                    pendingJoinSessions.set(userId, 'WAITING_INVITE');
                    return message.reply(`✅ Đã nhận được **${tokens.length} token**!\n👉 **Bước tiếp theo:** Hãy gửi **Link mời hoặc Mã mời** của server bạn muốn join vào đây nhé.`);
                } else {
                    return message.reply('❌ Không tìm thấy token hợp lệ trong tin nhắn của bạn. Vui lòng gửi lại!');
                }
            } else if (step === 'WAITING_INVITE') {
                const inviteLink = message.content.trim();
                if (inviteLink.length > 0) {
                    userInviteCache.set(userId, inviteLink);
                    pendingJoinSessions.delete(userId);
                    return message.reply(`✅ Đã lưu thông tin link mời thành công!\n👉 Bây giờ bạn hãy quay lại bất kỳ kênh chat nào và gõ lệnh **\`!joinn\`** để tiến hành cho tài khoản join nhé.`);
                }
            }
        }
        return;
    }

    const args = message.content.trim().split(/\s+/);
    const command = args[0];

    if (command === '!join') {
        if (!hasPermission(message.author.id)) return message.reply('❌ Bạn không có quyền sử dụng lệnh này!');

        pendingJoinSessions.set(message.author.id, 'WAITING_TOKENS');
        
        try {
            await message.author.send(`📥 **Hệ thống Join Server tự động:**\n👉 **Bước 1:** Gửi danh sách token của bạn vào đây (Mỗi token 1 hàng).`);
            return message.reply('✅ Đã gửi hướng dẫn vào tin nhắn riêng (DM) của bạn. Vui lòng kiểm tra hộp thư!');
        } catch (e) {
            pendingJoinSessions.delete(message.author.id);
            return message.reply('❌ Không thể nhắn tin riêng cho bạn! Hãy mở tính năng nhận tin nhắn từ thành viên trong server.');
        }
    }

    if (command === '!joinn') {
        if (!hasPermission(message.author.id)) return message.reply('❌ Bạn không có quyền sử dụng lệnh này!');
        
        const userId = message.author.id;
        const tokens = userTokenCache.get(userId);
        const inviteLink = userInviteCache.get(userId);

        if (!tokens || tokens.length === 0) {
            return message.reply('❌ Bạn chưa gửi token qua tin nhắn riêng (DM). Hãy gõ lệnh `!join` trước!');
        }
        if (!inviteLink) {
            return message.reply('❌ Bạn chưa cung cấp Link mời server qua tin nhắn riêng (DM). Hãy gõ lệnh `!join` để làm lại từ đầu!');
        }

        const progressMsg = await message.reply(`🚀 Đang tiến hành cho **${tokens.length} tài khoản** join server qua link mời...\n⏳ Tiến trình: 0/${tokens.length} hoàn thành.`);
        
        const scriptPath = path.resolve(__filename);
        const nodePath = process.execPath;
        
        let resultsText = [];
        let completedCount = 0;

        tokens.forEach((t, index) => {
            const child = spawn(nodePath, [scriptPath, '_worker_jointoken_server', t, inviteLink, message.author.id, index + 1], { stdio: ['inherit', 'pipe', 'inherit'] });
            
            let outputData = '';
            child.stdout.on('data', (data) => {
                outputData += data.toString();
                if (outputData.includes('__JOIN_RESULT__:')) {
                    const parts = outputData.trim().split('__JOIN_RESULT__:');
                    const lastPart = parts[parts.length - 1];
                    const colonIdx = lastPart.indexOf(':');
                    const targetUserId = lastPart.substring(0, colonIdx);
                    const resultMsg = lastPart.substring(colonIdx + 1);

                    if (targetUserId === message.author.id) {
                        resultsText.push(resultMsg);
                    }
                }
            });

            child.on('close', () => {
                completedCount++;
                if (completedCount === tokens.length) {
                    const embed = new EmbedBuilder()
                        .setTitle('📊 KẾT QUẢ TIẾN TRÌNH JOIN SERVER')
                        .setDescription(resultsText.join('\n') || 'Không có phản hồi.')
                        .setColor(0x00FFCC)
                        .setTimestamp();
                    progressMsg.edit({ content: '✅ **Đã hoàn thành toàn bộ tiến trình join!**', embeds: [embed] }).catch(() => {});
                } else {
                    progressMsg.edit(`🚀 Đang tiến hành cho **${tokens.length} tài khoản** join server...\n⏳ Tiến trình: ${completedCount}/${tokens.length} hoàn thành.`).catch(() => {});
                }
            });
        });
        return;
    }

    if (command === '!addnhac') {
        if (!hasPermission(message.author.id)) return message.reply('❌ Bạn không có quyền sử dụng lệnh này!');
        const songName = args.slice(1).join(' ').trim();
        if (!songName) return message.reply('❌ Vui lòng nhập tên nhạc! (VD: `!addnhac song.mp3`)');

        const foundPath = findSongFile(songName);
        if (!foundPath) return message.reply(`❌ Không tìm thấy tệp \`${songName}\` trong thư mục Download!`);
        return message.reply(`✅ Nhạc \`${songName}\` đã có sẵn và sẵn sàng phát!`);
    }

    if (command === '!listnhac') {
        if (!hasPermission(message.author.id)) return message.reply('❌ Bạn không có quyền xem danh sách này!');
        const localSongs = getLocalMusicFiles();
        if (localSongs.length === 0) return message.reply('📭 Không tìm thấy tệp nhạc nào trong thư mục Download!');

        let listDetails = localSongs.map((song, i) => `**${i + 1}.** \`${song}\` — 🟢 (Có sẵn)`);
        const embed = new EmbedBuilder()
            .setTitle('🎵 DANH SÁCH NHẠC TỪ DOWNLOAD')
            .setDescription(listDetails.join('\n'))
            .setColor(0x00FFCC)
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    if (command === '!add') {
        if (message.author.id !== OWNER_ID) return message.reply('❌ Chỉ Chủ Bot mới dùng được lệnh này!');
        const targetId = args[1];
        if (!targetId) return message.reply('❌ Vui lòng nhập ID!');
        let list = getWhitelist();
        if (list.includes(targetId)) return message.reply(`⚠️ ID \`${targetId}\` đã có sẵn!`);
        list.push(targetId);
        saveWhitelist(list);
        return message.reply(`✅ Đã cấp quyền cho ID: \`${targetId}\``);
    }

    if (command === '!remove') {
        if (message.author.id !== OWNER_ID) return message.reply('❌ Chỉ Chủ Bot mới dùng được lệnh này!');
        const targetId = args[1];
        if (!targetId) return message.reply('❌ Vui lòng nhập ID cần xóa!');
        if (targetId === OWNER_ID) return message.reply('❌ Không thể xóa Chủ Bot!');
        let list = getWhitelist();
        const index = list.indexOf(targetId);
        if (index === -1) return message.reply(`⚠️ Không tìm thấy ID \`${targetId}\`.`);
        list.splice(index, 1);
        saveWhitelist(list);
        return message.reply(`🗑️ Đã thu hồi quyền ID: \`${targetId}\``);
    }

    if (command === '!listid') {
        if (!hasPermission(message.author.id)) return message.reply('❌ Bạn không có quyền!');
        const whitelist = getWhitelist();
        const msg = await message.reply('⏳ Đang tải danh sách...');
        let listDetails = [];
        for (let i = 0; i < whitelist.length; i++) {
            const id = whitelist[i];
            let name = 'Không rõ tên';
            try {
                const user = await botClient.users.fetch(id);
                name = user.tag || user.username;
            } catch (e) {}
            const roleMark = id === OWNER_ID ? ' ⭐ (Chủ Bot)' : '';
            listDetails.push(`**${i + 1}.**${name} (\`${id}\`)${roleMark}`);
        }
        const embed = new EmbedBuilder()
            .setTitle('📋 DANH SÁCH ID ĐƯỢC CẤP QUYỀN')
            .setDescription(listDetails.join('\n') || 'Chưa có ID nào.')
            .setColor(0x00FFCC)
            .setTimestamp();
        return msg.edit({ content: null, embeds: [embed] }).catch(() => {});
    }

    if (command === '!panel') {
        if (!hasPermission(message.author.id)) return message.reply('❌ Bạn chưa được cấp quyền dùng panel!');

        const embed = new EmbedBuilder()
            .setTitle('🔥 BẢNG ĐIỀU KHIỂN CHỨC NĂNG — BÙI ĐỨC HUY VIP')
            .setDescription('Bấm vào các nút chức năng bên dưới để cấu hình và chạy tính năng:')
            .setColor(0x5865F2);

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_fn_1').setLabel('1. Mở nhạc').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_fn_2').setLabel('2. Treo room').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_fn_4').setLabel('4. Spam tin').setStyle(ButtonStyle.Primary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_fn_5').setLabel('5. Chửi tag ID').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_fn_6').setLabel('6. Nhây có tag').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_fn_7').setLabel('7. Raid').setStyle(ButtonStyle.Danger)
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_fn_8').setLabel('8. Lấy Token').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn_fn_9').setLabel('9. Spam nhập tin').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_fn_10').setLabel('10. Check Token').setStyle(ButtonStyle.Success)
        );

        const row4 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_fn_12').setLabel('12. Đổi Avatar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn_fn_13').setLabel('13. List Nhạc').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_fn_14').setLabel('14. Thêm ID').setStyle(ButtonStyle.Success)
        );

        const row5 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_fn_15').setLabel('15. Xóa ID').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('btn_stop').setLabel('🛑 Dừng').setStyle(ButtonStyle.Danger)
        );

        return message.reply({ embeds: [embed], components: [row1, row2, row3, row4, row5] });
    }
});

botClient.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() || interaction.isModalSubmit()) {
        const userId = interaction.user.id;
        if (!hasPermission(userId)) {
            return interaction.reply({ content: '❌ Bạn không có quyền thao tác trên bảng điều khiển này!', ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        const userId = interaction.user.id;

        if (interaction.customId === 'btn_fn_13') {
            const localSongs = getLocalMusicFiles();
            if (localSongs.length === 0) return interaction.reply({ content: '📭 Không tìm thấy tệp nhạc nào trong thư mục Download!', ephemeral: true });

            let listDetails = localSongs.map((song, i) => `**${i + 1}.** \`${song}\` — 🟢 (Có sẵn)`);
            const embed = new EmbedBuilder()
                .setTitle('🎵 DANH SÁCH NHẠC TỪ DOWNLOAD')
                .setDescription(listDetails.join('\n'))
                .setColor(0x00FFCC)
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (['btn_fn_1', 'btn_fn_2', 'btn_fn_4', 'btn_fn_5', 'btn_fn_6', 'btn_fn_7', 'btn_fn_8', 'btn_fn_9', 'btn_fn_10', 'btn_fn_12', 'btn_fn_14', 'btn_fn_15'].includes(interaction.customId)) {
            const mode = interaction.customId.replace('btn_fn_', '');
            const modal = new ModalBuilder()
                .setCustomId(`modal_run_${mode}`)
                .setTitle(`Cấu hình Chức năng [${mode}] - Bùi Đức Huy`);

            if (mode === '8') {
                const emailInput = new TextInputBuilder().setCustomId('input_email').setLabel('Email Discord').setStyle(TextInputStyle.Short).setRequired(true);
                const passInput = new TextInputBuilder().setCustomId('input_pass').setLabel('Mật khẩu Discord').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(emailInput), new ActionRowBuilder().addComponents(passInput));
            } else if (mode === '10') {
                const tokenInput = new TextInputBuilder().setCustomId('input_token').setLabel('Danh sách Token (cách nhau dấu ,)').setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
            } else if (mode === '12') {
                const tokenInput = new TextInputBuilder().setCustomId('input_token').setLabel('Danh sách Token (cách nhau dấu ,)').setStyle(TextInputStyle.Paragraph).setRequired(true);
                const imageInput = new TextInputBuilder().setCustomId('input_image_url').setLabel('Link ảnh trực tiếp (PNG, JPG, GIF)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(tokenInput), new ActionRowBuilder().addComponents(imageInput));
            } else if (mode === '14' || mode === '15') {
                const targetIdInput = new TextInputBuilder().setCustomId('input_target_id').setLabel('Nhập ID Discord cần cấp/xóa').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(targetIdInput));
            } else if (mode === '2') {
                const tokenInput = new TextInputBuilder().setCustomId('input_token').setLabel('Token (ngăn cách dấu ,)').setStyle(TextInputStyle.Paragraph).setRequired(true);
                const channelInput = new TextInputBuilder().setCustomId('input_channel').setLabel('ID Kênh Voice').setStyle(TextInputStyle.Short).setRequired(true);
                const muteInput = new TextInputBuilder().setCustomId('input_mute').setLabel('Tắt Mic? (y/n)').setStyle(TextInputStyle.Short).setRequired(true);
                const deafInput = new TextInputBuilder().setCustomId('input_deaf').setLabel('Điếc tai nghe (Deaf)? (y/n)').setStyle(TextInputStyle.Short).setRequired(true);
                const streamCamInput = new TextInputBuilder().setCustomId('input_stream_cam').setLabel('Bật Stream/Cam? (y/n)').setStyle(TextInputStyle.Short).setRequired(true);
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(tokenInput),
                    new ActionRowBuilder().addComponents(channelInput),
                    new ActionRowBuilder().addComponents(muteInput),
                    new ActionRowBuilder().addComponents(deafInput),
                    new ActionRowBuilder().addComponents(streamCamInput)
                );
            } else {
                const tokenInput = new TextInputBuilder().setCustomId('input_token').setLabel('Token (ngăn cách dấu ,)').setStyle(TextInputStyle.Paragraph).setRequired(true);
                const channelInput = new TextInputBuilder().setCustomId('input_channel').setLabel('ID Kênh (Voice/Text)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(tokenInput), new ActionRowBuilder().addComponents(channelInput));

                if (mode === '1') {
                    const songInput = new TextInputBuilder().setCustomId('input_param').setLabel('Tên file nhạc (VD: song.mp3)').setStyle(TextInputStyle.Short).setRequired(false);
                    const volInput = new TextInputBuilder().setCustomId('input_volume').setLabel('Âm lượng (0 - 10000000)').setStyle(TextInputStyle.Short).setRequired(false);
                    modal.addComponents(new ActionRowBuilder().addComponents(songInput), new ActionRowBuilder().addComponents(volInput));
                } else if (mode === '5') {
                    const tagInput = new TextInputBuilder().setCustomId('input_tag_ids').setLabel('ID cần tag (cách nhau dấu ,)').setStyle(TextInputStyle.Paragraph).setRequired(true);
                    const delayInput = new TextInputBuilder().setCustomId('input_delay').setLabel('Số giây delay').setStyle(TextInputStyle.Short).setRequired(true);
                    modal.addComponents(new ActionRowBuilder().addComponents(tagInput), new ActionRowBuilder().addComponents(delayInput));
                } else if (mode === '6') {
                    const targetUserInput = new TextInputBuilder().setCustomId('input_target_user').setLabel('ID User cần tag (cách nhau dấu ,)').setStyle(TextInputStyle.Paragraph).setRequired(true);
                    const delayInput = new TextInputBuilder().setCustomId('input_delay').setLabel('Số giây delay').setStyle(TextInputStyle.Short).setRequired(true);
                    modal.addComponents(new ActionRowBuilder().addComponents(targetUserInput), new ActionRowBuilder().addComponents(delayInput));
                } else if (mode === '7') {
                    const delayInput = new TextInputBuilder().setCustomId('input_delay').setLabel('Số giây delay').setStyle(TextInputStyle.Short).setRequired(true);
                    modal.addComponents(new ActionRowBuilder().addComponents(delayInput));
                } else if (mode === '9') {
                    const messageInput = new TextInputBuilder().setCustomId('input_spam_msg').setLabel('Nội dung tin nhắn spam').setStyle(TextInputStyle.Paragraph).setRequired(true);
                    const delayInput = new TextInputBuilder().setCustomId('input_delay').setLabel('Số giây delay').setStyle(TextInputStyle.Short).setRequired(true);
                    modal.addComponents(new ActionRowBuilder().addComponents(messageInput), new ActionRowBuilder().addComponents(delayInput));
                }
            }

            return await interaction.showModal(modal).catch(() => {});
        }

        if (interaction.customId === 'btn_stop') {
            const workers = activeWorkers.get(userId);
            if (!workers || workers.length === 0) {
                return interaction.reply({ content: '❌ Không có luồng worker nào đang hoạt động trong phiên này của bạn.', ephemeral: true });
            }
            
            workers.forEach(w => {
                try {
                    if (w && typeof w.kill === 'function') {
                        w.kill('SIGKILL');
                    }
                } catch (e) {}
            });
            
            activeWorkers.delete(userId);
            return interaction.reply({ content: '🛑 Đã ép dừng toàn bộ luồng chức năng đang chạy thành công!', ephemeral: true });
        }
    }

    if (interaction.isModalSubmit()) {
        const userId = interaction.user.id;
        if (interaction.customId.startsWith('modal_run_')) {
            const mode = interaction.customId.replace('modal_run_', '');

            if (mode === '14') {
                const targetId = interaction.fields.getTextInputValue('input_target_id').trim();
                if (!targetId) return interaction.reply({ content: '❌ Vui lòng nhập ID hợp lệ!', ephemeral: true });
                let list = getWhitelist();
                if (list.includes(targetId)) return interaction.reply({ content: `⚠️ ID \`${targetId}\` đã có sẵn trong danh sách từ trước!`, ephemeral: true });
                list.push(targetId);
                saveWhitelist(list);
                return interaction.reply({ content: `✅ Đã cấp quyền thành công cho ID: \`${targetId}\``, ephemeral: true });
            }

            if (mode === '15') {
                if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ Chỉ Chủ Bot mới có quyền thu hồi quyền!', ephemeral: true });
                const targetId = interaction.fields.getTextInputValue('input_target_id').trim();
                if (!targetId) return interaction.reply({ content: '❌ Vui lòng nhập ID cần xóa!', ephemeral: true });
                if (targetId === OWNER_ID) return interaction.reply({ content: '❌ Không thể xóa Chủ Bot khỏi hệ thống!', ephemeral: true });
                let list = getWhitelist();
                const index = list.indexOf(targetId);
                if (index === -1) return interaction.reply({ content: `⚠️ Không tìm thấy ID \`${targetId}\` trong danh sách quyền.`, ephemeral: true });
                list.splice(index, 1);
                saveWhitelist(list);
                return interaction.reply({ content: `🗑️ Đã thu hồi quyền thành công của ID: \`${targetId}\``, ephemeral: true });
            }

            if (mode === '8') {
                await interaction.reply({ content: '⏳ Đang đăng nhập tài khoản để lấy token...', ephemeral: true });
                const email = interaction.fields.getTextInputValue('input_email');
                const password = interaction.fields.getTextInputValue('input_pass');
                const scriptPath = path.resolve(__filename);
                const nodePath = process.execPath;

                const child = spawn(nodePath, [scriptPath, '_worker_gettoken', email, password, interaction.user.id], { stdio: ['inherit', 'pipe', 'inherit'] });
                let outputData = '';
                child.stdout.on('data', (data) => {
                    outputData += data.toString();
                    if (outputData.includes('__TOKEN_RESULT__:')) {
                        const parts = outputData.trim().split('__TOKEN_RESULT__:')[1].split(':');
                        const targetUserId = parts[0];
                        const token = parts.slice(1).join(':');
                        if (targetUserId === interaction.user.id) {
                            interaction.editReply({ content: `✅ **Lấy token thành công!**\n\`\`\`text\n${token}\n\`\`\`` }).catch(() => {});
                        }
                    } else if (outputData.includes('__TOKEN_ERROR__:')) {
                        const parts = outputData.trim().split('__TOKEN_ERROR__:')[1].split(':');
                        const targetUserId = parts[0];
                        const errorMsg = parts.slice(1).join(':');
                        if (targetUserId === interaction.user.id) {
                            interaction.editReply({ content: `❌ **Thất bại:** ${errorMsg}` }).catch(() => {});
                        }
                    }
                });
                return;
            }

            if (mode === '10') {
                await interaction.reply({ content: '⏳ Đang kiểm tra trạng thái token...', ephemeral: true });
                const tokenInputStr = interaction.fields.getTextInputValue('input_token');
                const scriptPath = path.resolve(__filename);
                const nodePath = process.execPath;

                const child = spawn(nodePath, [scriptPath, '_worker_checktoken', tokenInputStr, interaction.user.id], { stdio: ['inherit', 'pipe', 'inherit'] });
                let outputData = '';
                child.stdout.on('data', (data) => {
                    outputData += data.toString();
                    if (outputData.includes('__CHECK_RESULT__:')) {
                        try {
                            const parts = outputData.trim().split('__CHECK_RESULT__:');
                            const lastPart = parts[parts.length - 1];
                            const colonIndex = lastPart.indexOf(':');
                            const targetUserId = lastPart.substring(0, colonIndex);
                            const jsonStr = lastPart.substring(colonIndex + 1);

                            if (targetUserId === interaction.user.id) {
                                const resultsArray = JSON.parse(jsonStr);
                                const embed = new EmbedBuilder()
                                    .setTitle('🔍 KẾT QUẢ CHECK TOKEN')
                                    .setDescription(resultsArray.join('\n'))
                                    .setColor(0x00FFCC)
                                    .setTimestamp();
                                interaction.editReply({ content: null, embeds: [embed] }).catch(() => {});
                            }
                        } catch (e) {}
                    }
                });
                return;
            }

            if (mode === '12') {
                await interaction.reply({ content: '⏳ Đang tiến hành đổi avatar hàng loạt...', ephemeral: true });
                const tokenInputStr = interaction.fields.getTextInputValue('input_token');
                const imageUrl = interaction.fields.getTextInputValue('input_image_url');

                const tokens = tokenInputStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
                if (tokens.length === 0 || !imageUrl) return interaction.editReply({ content: '❌ Vui lòng nhập đủ token và link ảnh!' });

                const scriptPath = path.resolve(__filename);
                const nodePath = process.execPath;
                let resultsText = [];
                let completedCount = 0;

                for (const t of tokens) {
                    const child = spawn(nodePath, [scriptPath, '_worker_setavatar', t, imageUrl, interaction.user.id], { stdio: ['inherit', 'pipe', 'inherit'] });
                    let outputData = '';
                    
                    child.stdout.on('data', (data) => {
                        outputData += data.toString();
                        if (outputData.includes('__AVATAR_RESULT__:')) {
                            const parts = outputData.trim().split('__AVATAR_RESULT__:');
                            const lastPart = parts[parts.length - 1];
                            const colonIdx = lastPart.indexOf(':');
                            const targetUserId = lastPart.substring(0, colonIdx);
                            const resultMsg = lastPart.substring(colonIdx + 1);

                            if (targetUserId === interaction.user.id) {
                                resultsText.push(resultMsg);
                            }
                        }
                    });

                    child.on('close', () => {
                        completedCount++;
                        if (completedCount === tokens.length) {
                            const embed = new EmbedBuilder()
                                .setTitle('🖼️ KẾT QUẢ ĐỔI AVATAR HÀNG LOẠT')
                                .setDescription(resultsText.join('\n') || 'Không có kết quả trả về.')
                                .setColor(0x00FFCC)
                                .setTimestamp();
                            interaction.editReply({ content: null, embeds: [embed] }).catch(() => {});
                        }
                    });
                }
                return;
            }

            try {
                await interaction.reply({ content: '🚀 Đang khởi chạy chức năng song song...', ephemeral: true });
            } catch (e) { return; }

            const token = interaction.fields.getTextInputValue('input_token');
            const channelId = interaction.fields.getTextInputValue('input_channel');
            
            let param = '';
            let volumeParam = '100';
            let targetUser = '';
            let delaySec = '2';
            let spamMsg = '';
            let selfMuteInput = 'false';
            let selfDeafInput = 'true';
            let streamCamInputVal = 'false';

            if (mode === '1') {
                try { param = interaction.fields.getTextInputValue('input_param'); } catch (e) {}
                try { volumeParam = interaction.fields.getTextInputValue('input_volume'); } catch (e) {}
                if (!volumeParam) volumeParam = '100';
            } else if (mode === '2') {
                try { 
                    const rawMute = interaction.fields.getTextInputValue('input_mute').trim().toLowerCase();
                    selfMuteInput = (rawMute === 'y' || rawMute === 'true' || rawMute === '1' || rawMute === 'yes') ? 'true' : 'false';
                } catch (e) {}

                try { 
                    const rawDeaf = interaction.fields.getTextInputValue('input_deaf').trim().toLowerCase();
                    selfDeafInput = (rawDeaf === 'y' || rawDeaf === 'true' || rawDeaf === '1' || rawDeaf === 'yes') ? 'true' : 'false';
                } catch (e) {}

                try { 
                    const rawSC = interaction.fields.getTextInputValue('input_stream_cam').trim().toLowerCase();
                    streamCamInputVal = (rawSC === 'y' || rawSC === 'true' || rawSC === '1' || rawSC === 'yes') ? 'true' : 'false';
                } catch (e) {}
            } else if (mode === '5' || mode === '6') {
                try { param = interaction.fields.getTextInputValue('input_tag_ids'); } catch (e) {}
                try { targetUser = interaction.fields.getTextInputValue('input_target_user'); } catch (e) {}
                try { delaySec = interaction.fields.getTextInputValue('input_delay'); } catch (e) {}
            } else if (mode === '7') {
                try { delaySec = interaction.fields.getTextInputValue('input_delay'); } catch (e) {}
            } else if (mode === '9') {
                try { spamMsg = interaction.fields.getTextInputValue('input_spam_msg'); } catch (e) {}
                try { delaySec = interaction.fields.getTextInputValue('input_delay'); } catch (e) {}
            }

            const tokens = token.split(',').map(t => t.trim()).filter(t => t.length > 0);
            if (tokens.length === 0) return interaction.editReply({ content: '❌ Token không hợp lệ!' }).catch(() => {});

            const scriptPath = path.resolve(__filename);
            const nodePath = process.execPath;
            const newWorkers = [];

            for (const t of tokens) {
                let worker;
                if (mode === '1') {
                    worker = spawn(nodePath, [scriptPath, '_worker_audio', t, channelId, param || 'song.mp3', volumeParam], { stdio: 'inherit' });
                } else if (mode === '2') {
                    worker = spawn(nodePath, [scriptPath, '_worker_treo', t, channelId, selfMuteInput, selfDeafInput, streamCamInputVal], { stdio: 'inherit' });
                } else if (mode === '4') {
                    worker = spawn(nodePath, [scriptPath, '_worker_spam', t, channelId, '2000'], { stdio: 'inherit' });
                } else if (mode === '5') {
                    worker = spawn(nodePath, [scriptPath, '_worker_tagspam', t, channelId, param, delaySec], { stdio: 'inherit' });
                } else if (nodePath && mode === '6') {
                    worker = spawn(nodePath, [scriptPath, '_worker_nhay', t, channelId, targetUser, delaySec], { stdio: 'inherit' });
                } else if (mode === '7') {
                    worker = spawn(nodePath, [scriptPath, '_worker_raid', t, channelId, delaySec], { stdio: 'inherit' });
                } else if (mode === '9') {
                    worker = spawn(nodePath, [scriptPath, '_worker_spam_custom', t, channelId, spamMsg, delaySec], { stdio: 'inherit' });
                }
                if (worker) newWorkers.push(worker);
            }

            if (!activeWorkers.has(userId)) activeWorkers.set(userId, []);
            activeWorkers.get(userId).push(...newWorkers);

            return interaction.editReply({ 
                content: `🚀 Kích hoạt thành công Chức năng **[${mode}]** cho **${tokens.length} tài khoản**!` 
            }).catch(() => {});
        }
    }
});

botClient.login('MTU0NDE5OTQ2MTQwMjcxMDA2Ng.GN14cT.LxJ_UazaDr54-HvNhWJITaDXjH9yTMVVw3Ll-g');


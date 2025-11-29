const { Client, GatewayIntentBits, Routes, REST, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const botDataPath = path.join(__dirname, 'botData.json');

// Kanal isimleri (değiştirebilirsin)
const COMMAND_CHANNEL = "komut";
const SUGGESTION_CHANNEL = "istek-öneri";

// Veri yükleme
function loadBotData() {
    try {
        if (fs.existsSync(botDataPath)) {
            const data = fs.readFileSync(botDataPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading bot data:', error);
    }
    return { activeTime: {}, userWordCounts: {} };
}

// Veri kaydetme
function saveBotData(activeTime, userWordCounts) {
    try {
        const data = { activeTime, userWordCounts };
        fs.writeFileSync(botDataPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving bot data:', error);
    }
}

// RAM'de aktiflik verileri
let lastMessageTime = {}; // { userId: timestamp }
const loadedData = loadBotData();
let activeTime = loadedData.activeTime;      // { userId: dakika }
let userWordCounts = loadedData.userWordCounts;  // { userId: kelime sayısı }

// Bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Slash komutları
const commands = [
    {
        name: 'aktiflik',
        description: 'Kullanıcıların toplam aktif süre sıralamasını gösterir.'
    },
    {
        name: 'liderlik',
        description: 'Kelime sayısına göre sıralama gösterir.'
    },
    {
        name: 'öneri',
        description: 'Sunucu için önerinizi gönderin',
        options: [
            {
                name: 'mesaj',
                type: 3,
                description: 'Önerinizi yazın',
                required: true
            }
        ]
    }
];

// Slash komutları yükleme (bot ready olduktan sonra)
async function registerCommands() {
    try {
        const rest = new REST({ version: "10" }).setToken(TOKEN);
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log("/aktiflik, /liderlik ve /öneri komutları yüklendi.");
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Mesaj takibi
client.on("messageCreate", (msg) => {
    if (msg.author.bot) return;

    const userId = msg.author.id;
    const now = Date.now();

    // Aktiflik takibi
    if (!lastMessageTime[userId]) {
        lastMessageTime[userId] = now;
    } else {
        const diffMinutes = (now - lastMessageTime[userId]) / 1000 / 60;
        if (diffMinutes <= 5) {
            if (!activeTime[userId]) activeTime[userId] = 0;
            activeTime[userId] += diffMinutes;
        }
        lastMessageTime[userId] = now;
    }

    // Kelime sayısı takibi
    const wordCount = msg.content.trim().split(/\s+/).length;
    if (!userWordCounts[userId]) userWordCounts[userId] = 0;
    userWordCounts[userId] += wordCount;

    // Veriyi dosyaya kaydet
    saveBotData(activeTime, userWordCounts);
});

// /aktiflik komutu
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "aktiflik") {
        // Sıralama
        const sorted = Object.entries(activeTime)
            .sort((a, b) => b[1] - a[1]);

        const top5 = sorted.slice(0, 5);

        let text = "⏱️ **sh4rless tüm zamanlar aktiflik sıralaması**\n\n";

        const userId = interaction.user.id;
        const userActive = activeTime[userId] || 0;
        const userIndex = sorted.findIndex(([id]) => id === userId);
        const userRank = userIndex >= 0 ? userIndex + 1 : "Sıralamada yok";

        // Kullanıcının kendi aktiflik bilgisi
        const hours = Math.floor(userActive / 60);
        const minutes = Math.round(userActive % 60);

        text += `Güncel istatistikleriniz: ${interaction.user}\n`;
        text += `Sıralama: **${userRank}**\n`;
        text += `Toplam süre: **${hours} saat ${minutes} dakika**\n\n`;

        // En aktif 5 kişi
        text += "🔥 **En fazla aktif 5 kişi:**\n";

        if (top5.length === 0) {
            text += "_Henüz veri yok._";
        } else {
            for (let i = 0; i < top5.length; i++) {
                const [id, time] = top5[i];
                const h = Math.floor(time / 60);
                const m = Math.round(time % 60);

                const member = await interaction.guild.members.fetch(id).catch(() => null);

                text += `${i + 1}. **${member ? member.user.username : "Bilinmiyor"}** — ${h} saat ${m} dk\n`;
            }
        }

        return interaction.reply(text);
    }

    if (interaction.commandName === "liderlik") {
        // Kelime sıralaması
        const sorted = Object.entries(userWordCounts)
            .sort((a, b) => b[1] - a[1]);

        const top10 = sorted.slice(0, 10);

        let text = "🏆 **sh4rless Liderlik Tablosu (Kelime Sayısı)**\n\n";

        const userId = interaction.user.id;
        const userWords = userWordCounts[userId] || 0;
        const userIndex = sorted.findIndex(([id]) => id === userId);

        // Top 10'u göster
        for (let i = 0; i < top10.length; i++) {
            const [id, count] = top10[i];
            text += `**${i + 1}.** <@${id}> - ${count} kelime\n`;
        }

        // Kullanıcının sırasını her zaman ayrıca göster
        text += `\n━━━━━━━━━━━━━\n`;
        text += `**${userIndex + 1}.** <@${userId}> - ${userWords} kelime 👈 (senin sıran)`;

        return interaction.reply(text);
    }

    if (interaction.commandName === "öneri") {
        // Komut sadece komut kanalında çalışmalı
        if (!interaction.channel.name || !interaction.channel.name.toLowerCase().includes(COMMAND_CHANNEL)) {
            return interaction.reply({ content: `Bu komut sadece #${COMMAND_CHANNEL} kanalında kullanılabilir!`, ephemeral: true });
        }

        const suggestion = interaction.options.getString('mesaj');

        // Öneri kanalı bul
        const suggestionChannel = interaction.guild.channels.cache.find(ch => ch.name && ch.name.toLowerCase() === SUGGESTION_CHANNEL.toLowerCase());
        if (!suggestionChannel) {
            return interaction.reply({ content: `#${SUGGESTION_CHANNEL} kanalı bulunamadı! Lütfen bu adda bir kanal oluştur.`, ephemeral: true });
        }

        // Embed oluştur
        const embed = new EmbedBuilder()
            .setTitle("💡 Yeni Öneri")
            .setDescription(suggestion)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields({ name: "Gönderen", value: `${interaction.user}`, inline: true })
            .setColor(0x00AE86)
            .setTimestamp();

        // Butonlar oluştur
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('suggestion_approve')
                    .setLabel('Katılıyorum')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('suggestion_reject')
                    .setLabel('Katılmıyorum')
                    .setStyle(ButtonStyle.Danger)
            );

        // Öneriyi gönder
        await suggestionChannel.send({ embeds: [embed], components: [row] });

        await interaction.reply({ content: `Öneriniz #${SUGGESTION_CHANNEL} kanalına gönderildi!`, ephemeral: true });
    }
});

// Buton tıklaması
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    try {
        const message = interaction.message;
        
        if (!message.guild) return;
        
        const member = await message.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) return;

        // Yetkili rolü kontrol et
        const hasModRole = member.roles.cache.some(r => 
            r.name.toLowerCase().includes('yetkili') || 
            r.name.toLowerCase().includes('server sahibi') ||
            r.name.toLowerCase().includes('yönetici') ||
            r.permissions.has('MANAGE_MESSAGES') ||
            r.permissions.has('ADMINISTRATOR')
        );
        if (!hasModRole) {
            return interaction.reply({ content: 'Bu işlemi yapabilmek için yetkili olmanız gerekiyor!', ephemeral: true });
        }

        // Embedli mesajlar üzerinde işlem
        if (!message.embeds || message.embeds.length === 0) return;

        const embed = message.embeds[0];

        // Katılıyorum (Approve)
        if (interaction.customId === 'suggestion_approve') {
            const newEmbed = EmbedBuilder.from(embed).setColor(0x00FF00).setFooter({ text: 'Öneri kabul edildi' });
            await message.edit({ embeds: [newEmbed], components: [] });
            await message.reply('✅ **Öneri kabul edildi**');
            await interaction.reply({ content: 'Öneri kabul edildi!', ephemeral: true });
        }

        // Katılmıyorum (Reject)
        if (interaction.customId === 'suggestion_reject') {
            const newEmbed = EmbedBuilder.from(embed).setColor(0xFF0000).setFooter({ text: 'Öneri reddedildi' });
            await message.edit({ embeds: [newEmbed], components: [] });
            await message.reply('❌ **Öneri reddedildi**');
            await interaction.reply({ content: 'Öneri reddedildi!', ephemeral: true });
        }
    } catch (error) {
        console.error('Buton hatası:', error);
    }
});

client.on("ready", async () => {
    console.log(`Bot aktif: ${client.user.tag}`);
    await registerCommands();
});

client.login(TOKEN);

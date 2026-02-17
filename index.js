// index.js
import { Client, GatewayIntentBits, Partials, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

// ---------------- CONFIG ----------------
// Alles über Environment Variables von Render
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const PLAYER_ROLE = process.env.PLAYER_ROLE;
const ADMIN_ROLE = process.env.ADMIN_ROLE;
const CHANNEL_CREATE = process.env.CHANNEL_CREATE;
const CHANNEL_MARKET = process.env.CHANNEL_MARKET;
const CHANNEL_ARCHIVE = process.env.CHANNEL_ARCHIVE;
const CHANNEL_LOGS = process.env.CHANNEL_LOGS;
const CHANNEL_ADMIN = process.env.CHANNEL_ADMIN;
const CHANNEL_MISSIONS = process.env.CHANNEL_MISSIONS;

// ---------------- CLIENT ----------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ---------------- CACHE ----------------
const openCreations = new Map(); // Map<ChannelID, { userId, type, description, reward, anonymous }>

// ---------------- READY ----------------
client.once(Events.ClientReady, async () => {
    console.log(`Eingeloggt als ${client.user.tag}`);

    try {
        const guild = await client.guilds.fetch(GUILD_ID);

        // Marktplatz Channel
        const marketChannel = await guild.channels.fetch(CHANNEL_MARKET);
        if (!marketChannel.isTextBased()) throw new Error("Marktplatz Channel ist kein Textkanal");

        // Prüfen, ob Bot-Nachricht schon existiert
        const messages = await marketChannel.messages.fetch({ limit: 50 });
        const botMessage = messages.find(m => m.author.id === client.user.id && m.content.includes("FINAL HELL – MARKTPLATZ"));

        if (!botMessage) {
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('create_auftrag').setLabel('💰 Auftrag').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('create_ankauf').setLabel('🛒 Ankauf').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('create_verkauf').setLabel('📦 Verkauf').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('create_hilfe').setLabel('🆘 Hilfe').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('create_suche').setLabel('🔍 Ich suche').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('create_biete').setLabel('🎁 Ich biete').setStyle(ButtonStyle.Primary)
                );

            await marketChannel.send({ content: "📜 **FINAL HELL – MARKTPLATZ**\nWähle aus, was du erstellen möchtest:", components: [row] });
        }

    } catch (err) {
        console.error("Fehler beim Laden der Channels:", err);
    }
});

// ---------------- INTERACTIONS ----------------
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    const member = interaction.member;

    // Berechtigungen prüfen
    if (!member.roles.cache.has(PLAYER_ROLE) && !member.roles.cache.has(ADMIN_ROLE)) {
        return interaction.reply({ content: "Du hast keine Berechtigung.", ephemeral: true });
    }

    // ----- Aufträge erstellen -----
    if (interaction.customId.startsWith('create_')) {
        const type = interaction.customId.replace('create_', '');
        const username = member.user.username.toLowerCase();
        const randomId = Math.floor(Math.random() * 9000 + 1000);
        const channelName = `erstellung-${username}-${randomId}`;

        try {
            const guild = await client.guilds.fetch(GUILD_ID);
            const createdChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: null, // optional Parent
                permissionOverwrites: [
                    { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: PLAYER_ROLE, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] },
                    { id: ADMIN_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
                    { id: member.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ]
            });

            openCreations.set(createdChannel.id, { userId: member.id, type, description: null, reward: null, anonymous: false });
            await createdChannel.send(`📜 **FINAL HELL – ${type.toUpperCase()} ERSTELLEN**\nSchreibe hier dein Anliegen. Danach fragt der Bot nach Preis/Belohnung und Anonymwahl.`);

            return interaction.reply({ content: `Privater Erstellungs-Channel erstellt: ${createdChannel}`, ephemeral: true });

        } catch (err) {
            console.error("Fehler beim Erstellen des Channels:", err);
            return interaction.reply({ content: "Fehler beim Erstellen des privaten Channels.", ephemeral: true });
        }
    }
});

// ---------------- MESSAGE HANDLER ----------------
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!openCreations.has(message.channel.id)) return;

    const creation = openCreations.get(message.channel.id);

    if (!creation.description) {
        creation.description = message.content;
        await message.channel.send("Möchtest du einen Preis oder Belohnung angeben? Antworte mit Betrag oder 'kein'.");
        return;
    }

    if (!creation.reward) {
        creation.reward = message.content.toLowerCase() === 'kein' ? 'Keine' : message.content;
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('anonymous_no').setLabel('👤 Öffentlich posten').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('anonymous_yes').setLabel('🕶️ Anonym posten').setStyle(ButtonStyle.Secondary)
            );
        await message.channel.send({ content: "Möchtest du anonym posten?", components: [row] });
    }
});

// ---------------- LOGIN ----------------
client.login(DISCORD_TOKEN);

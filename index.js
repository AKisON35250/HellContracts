// index.js
import { Client, GatewayIntentBits, Partials, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

// ---------------- CONFIG ----------------
// Werte in Render als Environment Variables setzen
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;   // Dein Bot Token
const GUILD_ID = process.env.GUILD_ID;             // Server-ID
const PLAYER_ROLE = process.env.PLAYER_ROLE;       // Spieler-Rolle
const ADMIN_ROLE = process.env.ADMIN_ROLE;         // Admin-Rolle
const CHANNEL_CREATE = process.env.CHANNEL_CREATE; // Erstellungs-Channel
const CHANNEL_MARKET = process.env.CHANNEL_MARKET; // Marktplatz-Channel
const CHANNEL_ARCHIVE = process.env.CHANNEL_ARCHIVE; // Archiv-Channel
const CHANNEL_LOGS = process.env.CHANNEL_LOGS;       // Logs
const CHANNEL_ADMIN = process.env.CHANNEL_ADMIN;     // Admin Panel
const CHANNEL_MISSIONS = process.env.CHANNEL_MISSIONS; // Missionen-Channel

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
        const marketChannel = await guild.channels.fetch(CHANNEL_MARKET);
        if (!marketChannel.isTextBased()) throw new Error("Marktplatz Channel ist kein Textkanal");

        // Prüfen, ob Bot-Nachricht existiert
        const messages = await marketChannel.messages.fetch({ limit: 50 });
        const botMessage = messages.find(m => m.author.id === client.user.id && m.content.includes("FINAL HELL – MARKTPLATZ"));

        if (!botMessage) {
            // 6 Buttons → in 2 Rows aufteilen
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('create_auftrag').setLabel('💰 Auftrag').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('create_ankauf').setLabel('🛒 Ankauf').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('create_verkauf').setLabel('📦 Verkauf').setStyle(ButtonStyle.Primary)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('create_hilfe').setLabel('🆘 Hilfe').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('create_suche').setLabel('🔍 Ich suche').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('create_biete').setLabel('🎁 Ich biete').setStyle(ButtonStyle.Primary)
            );

            await marketChannel.send({
                content: "📜 **FINAL HELL – MARKTPLATZ**\nWähle aus, was du erstellen möchtest:",
                components: [row1, row2]
            });
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
                parent: null,
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

    // ----- Anonymwahl -----
    if (interaction.customId === 'anonymous_yes' || interaction.customId === 'anonymous_no') {
        const creation = openCreations.get(interaction.channel.id);
        if (!creation) return;

        creation.anonymous = interaction.customId === 'anonymous_yes';
        try {
            const guild = await client.guilds.fetch(GUILD_ID);
            const marketChannel = await guild.channels.fetch(CHANNEL_MARKET);

            const embed = new EmbedBuilder()
                .setTitle(creation.type.toUpperCase())
                .setDescription(`**Beschreibung:** ${creation.description}\n**Belohnung:** ${creation.reward}\n**Erstellt von:** ${creation.anonymous ? '🕶️ Anonymer Auftraggeber' : `<@${creation.userId}>`}\n**Status:** 🟢 Offen`)
                .setColor(0xff0000);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`take_${interaction.channel.id}`).setLabel('✅ Annehmen').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`interest_${interaction.channel.id}`).setLabel('🔔 Interesse zeigen').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`withdraw_${interaction.channel.id}`).setLabel('❌ Zurückziehen').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`finish_${interaction.channel.id}`).setLabel('🔒 Abschließen').setStyle(ButtonStyle.Secondary)
                );

            await marketChannel.send({ embeds: [embed], components: [row] });

            const logs = await guild.channels.fetch(CHANNEL_LOGS);
            await logs.send(`<@${creation.userId}> hat einen Auftrag erstellt: ${creation.type} (Anonym: ${creation.anonymous})`);

            await interaction.channel.delete();
            openCreations.delete(interaction.channel.id);
            return interaction.reply({ content: `Auftrag veröffentlicht!`, ephemeral: true });

        } catch (err) {
            console.error("Fehler beim Posten des Auftrags:", err);
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

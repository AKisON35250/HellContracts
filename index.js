// index.js
import { Client, GatewayIntentBits, Partials, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

// ---------------- CONFIG ----------------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// Server & Rollen IDs
const GUILD_ID = "DEIN_SERVER_ID"; // z.B. "123456789012345678"
const PLAYER_ROLE = "ID_SPIELER";   // z.B. "111222333444555666"
const ADMIN_ROLE = "ID_ADMIN";      // z.B. "777888999000111222"

// Channels
const CHANNEL_CREATE = "ID_AUFTRAG_ERSTELLEN"; // privater Erstellungs-Channel
const CHANNEL_MARKET = "ID_MARKTPLATZ";        // Marktplatz
const CHANNEL_ARCHIVE = "ID_ARCHIV";           // Archiv
const CHANNEL_LOGS = "ID_LOGS";               // Logs
const CHANNEL_ADMIN = "ID_ADMIN";             // Admin Panel
const CHANNEL_MISSIONS = "ID_MISSIONEN";      // Missionen

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
const activeAssignments = new Map(); // Map<MessageID, { creatorId, takerId, interestedIds: [] }>

// ---------------- READY ----------------
client.once(Events.ClientReady, async () => {
    console.log(`Eingeloggt als ${client.user.tag}`);
    // Optional: Marktplatz Bot-Nachricht erstellen, falls nicht vorhanden
    const marketChannel = await client.channels.fetch(CHANNEL_MARKET);
    if (marketChannel.isTextBased()) {
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
    }
});

// ---------------- INTERACTIONS ----------------
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    const member = interaction.member;

    if (!member.roles.cache.has(PLAYER_ROLE) && !member.roles.cache.has(ADMIN_ROLE)) {
        return interaction.reply({ content: "Du hast keine Berechtigung.", ephemeral: true });
    }

    // ----- Aufträge erstellen -----
    if (interaction.customId.startsWith('create_')) {
        const type = interaction.customId.replace('create_', '');
        const username = member.user.username.toLowerCase();
        const randomId = Math.floor(Math.random() * 9000 + 1000);
        const channelName = `erstellung-${username}-${randomId}`;

        const guild = interaction.guild;
        const createdChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: interaction.channel.parentId,
            permissionOverwrites: [
                { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: PLAYER_ROLE, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] },
                { id: ADMIN_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
                { id: member.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        openCreations.set(createdChannel.id, { userId: member.id, type, description: null, reward: null, anonymous: false });
        await createdChannel.send(`📜 **FINAL HELL – ${type.toUpperCase()} ERSTELLEN**\nBeschreibe hier dein Anliegen. Danach fragt der Bot nach Preis/Belohnung und Anonymwahl.`);

        return interaction.reply({ content: `Privater Erstellungs-Channel erstellt: ${createdChannel}`, ephemeral: true });
    }

    // ----- Anonymwahl -----
    if (interaction.customId === 'anonymous_yes' || interaction.customId === 'anonymous_no') {
        const creation = openCreations.get(interaction.channel.id);
        if (!creation) return;

        creation.anonymous = interaction.customId === 'anonymous_yes';

        // Posten im Marktplatz
        const marketChannel = await client.channels.fetch(CHANNEL_MARKET);
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

        const logs = await client.channels.fetch(CHANNEL_LOGS);
        await logs.send(`<@${creation.userId}> hat einen Auftrag erstellt: ${creation.type} (Anonym: ${creation.anonymous})`);

        // Privater Channel löschen
        await interaction.channel.delete();
        openCreations.delete(interaction.channel.id);
        return interaction.reply({ content: `Auftrag veröffentlicht!`, ephemeral: true });
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


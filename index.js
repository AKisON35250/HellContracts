// index.js
import { Client, GatewayIntentBits, Partials, PartialsFlags, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const PREFIX = '!'; // Optional für Admin Commands
const guildId = 'DEINE_GUILD_ID'; // Hier deine Discord Server ID

// In-Memory Cache
const openCreations = new Map(); // Map<ChannelID, {userId, type, anonymous}>
const activeAssignments = new Map(); // Map<AuftragsID, {creatorId, takerId, interestedIds[]}>

// Rollen IDs
const PLAYER_ROLE = 'ID_SPIELER';
const ADMIN_ROLE = 'ID_ADMIN';

// Channel IDs
const CHANNEL_MARKET = 'ID_MARKTPLATZ';
const CHANNEL_LOGS = 'ID_LOGS';
const CHANNEL_ARCHIVE = 'ID_ARCHIV';
const CHANNEL_ADMIN = 'ID_ADMIN';
const CHANNEL_MISSIONS = 'ID_MISSIONEN';
const CHANNEL_CREATE = 'ID_AUFTRAG_ERSTELLEN';

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Optional: Starte Bot Nachricht in Marktplatz
    const marketChannel = await client.channels.fetch(CHANNEL_MARKET);
    if (marketChannel.isTextBased()) {
        const existing = await marketChannel.messages.fetch({ limit: 50 });
        const botMessage = existing.find(m => m.author.id === client.user.id && m.content.includes("FINAL HELL – MARKTPLATZ"));
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

// Button Interaction Handler
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    const member = interaction.member;
    if (!member.roles.cache.has(PLAYER_ROLE) && !member.roles.cache.has(ADMIN_ROLE)) {
        return interaction.reply({ content: "Du hast keine Berechtigung.", ephemeral: true });
    }

    // Buttons für Erstellung
    if (interaction.customId.startsWith('create_')) {
        const type = interaction.customId.replace('create_', '');
        const username = member.user.username.toLowerCase();
        const randomId = Math.floor(Math.random() * 9000 + 1000);
        const channelName = `erstellung-${username}-${randomId}`;

        // Private Channel erstellen
        const guild = interaction.guild;
        const createdChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: interaction.channel.parentId,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: PLAYER_ROLE,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                    deny: [PermissionsBitField.Flags.SendMessages]
                },
                {
                    id: ADMIN_ROLE,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels]
                },
                {
                    id: member.user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
                }
            ]
        });

        openCreations.set(createdChannel.id, { userId: member.id, type, anonymous: false });

        await createdChannel.send(`📜 **FINAL HELL – ${type.toUpperCase()} ERSTELLEN**\nBeschreibe hier dein Anliegen. Danach fragt der Bot nach Preis/Belohnung und ob anonym.`);

        return interaction.reply({ content: `Privater Erstellungs-Channel erstellt: ${createdChannel}`, ephemeral: true });
    }

    // TODO: Direktannahme / Interesse / Zurückziehen / Abschluss Buttons
    // Wird unten ergänzt
});

// Message Create Handler für Auftragserstellung Schritte
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!openCreations.has(message.channel.id)) return;

    const creation = openCreations.get(message.channel.id);

    if (!creation.description) {
        // Schritt 1 – Beschreibung
        creation.description = message.content;
        await message.channel.send("Möchtest du einen Preis oder Belohnung angeben? Antworte mit Betrag oder 'kein'.");
        return;
    }

    if (!creation.reward) {
        // Schritt 2 – Preis / Belohnung
        const content = message.content.toLowerCase();
        creation.reward = (content === 'kein') ? 'Keine' : content;
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('anonymous_no').setLabel('👤 Öffentlich posten').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('anonymous_yes').setLabel('🕶️ Anonym posten').setStyle(ButtonStyle.Secondary)
            );
        await message.channel.send({ content: "Möchtest du anonym posten?", components: [row] });
        return;
    }
});

// Button für anonym Auswahl
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'anonymous_yes' && interaction.customId !== 'anonymous_no') return;

    const creation = openCreations.get(interaction.channel.id);
    if (!creation) return;

    creation.anonymous = (interaction.customId === 'anonymous_yes');

    // Fertig → Posten im Marktplatz
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

    const sentMessage = await marketChannel.send({ embeds: [embed], components: [row] });

    // Log
    const logs = await client.channels.fetch(CHANNEL_LOGS);
    await logs.send(`<@${creation.userId}> hat einen Auftrag erstellt: ${creation.type} (Anonym: ${creation.anonymous})`);

    // Private Channel löschen
    await interaction.channel.delete();
    openCreations.delete(interaction.channel.id);
    await interaction.reply({ content: `Auftrag veröffentlicht!`, ephemeral: true });
});

// TODO: Direktannahme / Interesse / Auswahl von Interessenten / Abschluss Buttons
// Die Logik würde ähnlich wie oben sein:
// - take_CHANNELID → Status auf 🔴 In Bearbeitung, privater Auftrag-Channel erstellen
// - interest_CHANNELID → Liste der Interessenten pflegen, Ersteller kann auswählen
// - withdraw_CHANNELID → zurückziehen, Embed löschen oder archivieren
// - finish_CHANNELID → Status ✅ Erledigt, Embed ins Archiv verschieben, privater Auftrag-Channel löschen

client.login(process.env.DISCORD_TOKEN);

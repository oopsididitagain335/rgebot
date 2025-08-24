require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');
const express = require('express');

// 🌐 Express Web Server
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('<h1>Regime Unit Ticket Bot</h1><p>✅ Bot is running and connected to Discord.</p>');
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// 🤖 Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// 🔧 Hardcoded IDs
const TICKET_CATEGORY_ID = '1408931971811512420'; // Ticket category
const SUPPORT_ROLE_ID = '1409167134831022242'; // Support role
const TICKET_OPEN_LOG_ID = '1408876441164054608'; // Open log
const TICKET_CLOSE_LOG_ID = '1408876442321686548'; // Close log
const BANNER_URL = 'https://www.stealthunitgg.xyz/money.png'; // Banner image

// 🎟️ Ticket Types (Apply Staff REMOVED)
const TYPES = {
  APPLY_TEAM: 'apply_team',
  SUPPORT: 'support',
  CONTACT_OWNER: 'contact_owner',
};

// 🎨 Branding
const BRAND_COLOR = '#000000';
const BRAND_EMOJIS = {
  apply_team: '🎯',
  support: '🛠️',
  contact_owner: '👑',
  close: '🔒',
  claim: '🔖',
};

const TICKET_TYPE_NAMES = {
  [TYPES.APPLY_TEAM]: 'Apply Team',
  [TYPES.SUPPORT]: 'Support',
  [TYPES.CONTACT_OWNER]: 'Contact Owner',
};

client.once('ready', () => {
  console.log(`✅ ${client.user.tag} is online and ready!`);
});

// 🛠️ Send ticket panel (Admins only) — WITHOUT Apply Staff
client.on('messageCreate', async (message) => {
  if (message.content === '!ticketpanel' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const embed = new EmbedBuilder()
      .setTitle(`${BRAND_EMOJIS.contact_owner} Open a Ticket`)
      .setDescription('Choose a ticket type below to get assistance.')
      .setImage(BANNER_URL)
      .setColor(BRAND_COLOR)
      .setFooter({ text: 'Regime Unit', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    // Only Apply Team, Support, and Contact Owner
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(TYPES.APPLY_TEAM).setLabel('Apply Team').setStyle(ButtonStyle.Primary).setEmoji(BRAND_EMOJIS.apply_team),
      new ButtonBuilder().setCustomId(TYPES.SUPPORT).setLabel('Support').setStyle(ButtonStyle.Success).setEmoji(BRAND_EMOJIS.support)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(TYPES.CONTACT_OWNER).setLabel('Contact Owner').setStyle(ButtonStyle.Secondary).setEmoji(BRAND_EMOJIS.contact_owner)
    );

    await message.channel.send({ embeds: [embed], components: [row1, row2] });
  }
});

// 🎟️ Handle Button Interactions (Create Tickets Only)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, guild, member } = interaction;

  // Only handle valid ticket types (Apply Staff is gone)
  if (![TYPES.APPLY_TEAM, TYPES.SUPPORT, TYPES.CONTACT_OWNER].includes(customId)) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const category = guild.channels.cache.get(TICKET_CATEGORY_ID);
    if (!category) {
      return await interaction.editReply({ content: '❌ Ticket category not found.' });
    }

    let permissionOverwrites = [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
    ];

    // Grant access to Support role for Apply Team and Support tickets
    if (customId === TYPES.SUPPORT || customId === TYPES.APPLY_TEAM) {
      permissionOverwrites.push({
        id: SUPPORT_ROLE_ID,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
      });
    }

    // For Contact Owner, hide from Support role
    if (customId === TYPES.CONTACT_OWNER) {
      permissionOverwrites.push({
        id: SUPPORT_ROLE_ID,
        deny: [PermissionsBitField.Flags.ViewChannel],
      });
    }

    // Add Admin access
    const adminRole = guild.roles.cache.find(r => r.permissions.has(PermissionsBitField.Flags.Administrator));
    if (adminRole) {
      permissionOverwrites.push({
        id: adminRole.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels],
      });
    }

    // Create ticket channel
    const channelName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category,
      topic: `User: ${user.tag} (${user.id}) | Type: ${customId}`,
      permissionOverwrites,
    });

    // Send welcome message
    const ticketEmbed = new EmbedBuilder()
      .setTitle(`${BRAND_EMOJIS[customId]} ${TICKET_TYPE_NAMES[customId]} Opened`)
      .setDescription('Please describe your request in detail.')
      .addFields(
        { name: '👤 User', value: `<@${user.id}>`, inline: true },
        { name: '📁 Category', value: TICKET_TYPE_NAMES[customId], inline: true }
      )
      .setColor(BRAND_COLOR)
      .setFooter({ text: 'Regime Unit', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    const closeBtn = new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji(BRAND_EMOJIS.close);

    const claimBtn = new ButtonBuilder()
      .setCustomId('claim_ticket')
      .setLabel('Claim Ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji(BRAND_EMOJIS.claim);

    const row = new ActionRowBuilder().addComponents(closeBtn, claimBtn);

    await ticketChannel.send({
      content: `<@${user.id}>`,
      embeds: [ticketEmbed],
      components: [row],
    });

    // 📜 Log ticket open
    const openLog = guild.channels.cache.get(TICKET_OPEN_LOG_ID);
    if (openLog) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🎫 Ticket Opened')
        .setDescription(`**Type:** ${TICKET_TYPE_NAMES[customId]}\n**Channel:** ${ticketChannel}`)
        .addFields(
          { name: '👤 User', value: `<@${user.id}>`, inline: true },
          { name: '🆔 ID', value: `\`${user.id}\``, inline: true }
        )
        .setColor('#00FF00')
        .setTimestamp();
      await openLog.send({ embeds: [logEmbed] });
    }

    await interaction.editReply({
      content: `✅ Ticket created: ${ticketChannel}`,
      ephemeral: true,
    });
  } catch (err) {
    console.error(err);
    await interaction.editReply({ content: '❌ Failed to create ticket.' });
  }
});

// 🔒 Handle Close & Claim Ticket Buttons
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, channel, member, guild } = interaction;

  // 🔒 Close Ticket
  if (customId === 'close_ticket') {
    if (!channel.name.startsWith('ticket-')) {
      return await interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🔒 Closing Ticket')
      .setDescription('Deleting in 5 seconds...')
      .setColor('#FF0000');
    await interaction.reply({ embeds: [embed] });

    // Log closure
    const logChannel = guild.channels.cache.get(TICKET_CLOSE_LOG_ID);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🗑️ Ticket Closed')
        .setDescription(`**Channel:** ${channel}\n**Closed by:** ${member}`)
        .addFields({ name: '📁 Category', value: channel.parent?.name || 'None', inline: true })
        .setColor('#FF4500')
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] });
    }

    setTimeout(() => channel.delete().catch(console.error), 5000);
  }

  // 🏷️ Claim Ticket
  if (customId === 'claim_ticket') {
    const hasSupport = member.roles.cache.has(SUPPORT_ROLE_ID);
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (!hasSupport && !isAdmin) {
      return await interaction.reply({ content: '❌ You do not have permission to claim this ticket.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🔖 Ticket Claimed')
      .setDescription(`Claimed by ${member}`)
      .setColor('#00FF00');
    await interaction.reply({ embeds: [embed] });
  }
});

// 🚀 Login
client.login(process.env.TOKEN);

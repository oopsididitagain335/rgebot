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
  ],
});

// 🔧 Hardcoded IDs
const TICKET_CATEGORY_ID = '1408931971811512420'; // Ticket category
const SUPPORT_ROLE_ID = '1409167134831022242'; // Support role
const STAFF_ROLE_ID = '1409167134831022242'; // Role for staff (adjust if different)
const TICKET_OPEN_LOG_ID = '1408876441164054608'; // Open log
const TICKET_CLOSE_LOG_ID = '1408876442321686548'; // Close log
const BANNER_URL = 'https://www.stealthunitgg.xyz/money.png'; // Banner image

// 🎟️ Ticket Types
const TYPES = {
  APPLY_TEAM: 'apply_team',
  APPLY_STAFF: 'apply_staff', // Now opens a ticket
  SUPPORT: 'support',
  CONTACT_OWNER: 'contact_owner',
};

// 🎨 Branding
const BRAND_COLOR = '#000000';
const BRAND_EMOJIS = {
  apply_team: '🎯',
  apply_staff: '💼',
  support: '🛠️',
  contact_owner: '👑',
  close: '🔒',
  claim: '🔖',
};

const TICKET_TYPE_NAMES = {
  [TYPES.APPLY_TEAM]: 'Apply Team',
  [TYPES.APPLY_STAFF]: 'Apply Staff',
  [TYPES.SUPPORT]: 'Support',
  [TYPES.CONTACT_OWNER]: 'Contact Owner',
};

client.once('ready', () => {
  console.log(`✅ ${client.user.tag} is online and ready!`);
});

// 🛠️ Send ticket panel (Admins only)
client.on('messageCreate', async (message) => {
  if (message.content === '!ticketpanel' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const embed = new EmbedBuilder()
      .setTitle(`${BRAND_EMOJIS.contact_owner} Open a Ticket`)
      .setDescription('Choose a ticket type below to get assistance.')
      .setImage(BANNER_URL)
      .setColor(BRAND_COLOR)
      .setFooter({ text: 'Regime Unit', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(TYPES.APPLY_TEAM).setLabel('Apply Team').setStyle(ButtonStyle.Primary).setEmoji(BRAND_EMOJIS.apply_team),
      new ButtonBuilder().setCustomId(TYPES.APPLY_STAFF).setLabel('Apply Staff').setStyle(ButtonStyle.Danger).setEmoji(BRAND_EMOJIS.apply_staff)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(TYPES.SUPPORT).setLabel('Support').setStyle(ButtonStyle.Success).setEmoji(BRAND_EMOJIS.support),
      new ButtonBuilder().setCustomId(TYPES.CONTACT_OWNER).setLabel('Contact Owner').setStyle(ButtonStyle.Secondary).setEmoji(BRAND_EMOJIS.contact_owner)
    );

    await message.channel.send({ embeds: [embed], components: [row1, row2] });
  }
});

// 🎟️ Handle Button Interactions (All Tickets)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, guild, member } = interaction;

  // Only handle valid ticket types
  if (!Object.values(TYPES).includes(customId)) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const category = guild.channels.cache.get(TICKET_CATEGORY_ID);
    if (!category) {
      return await interaction.editReply({ content: '❌ Ticket category not found.' });
    }

    // Base permissions: user can view, @everyone denied
    let permissionOverwrites = [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
    ];

    // Define access based on ticket type
    if (customId === TYPES.APPLY_STAFF) {
      // Only Staff and Admins can see Apply Staff tickets
      permissionOverwrites.push({
        id: STAFF_ROLE_ID,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
      });
    } else if (customId === TYPES.SUPPORT || customId === TYPES.APPLY_TEAM) {
      // Support team can help
      permissionOverwrites.push({
        id: SUPPORT_ROLE_ID,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
      });
    } else if (customId === TYPES.CONTACT_OWNER) {
      // Contact Owner: hide from support, show only to admins
      // (Support denied above; admin will be added below)
    }

    // Always allow Admins full access
    const adminRole = guild.roles.cache.find(r => r.permissions.has(PermissionsBitField.Flags.Administrator));
    if (adminRole) {
      permissionOverwrites.push({
        id: adminRole.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels],
      });
    }

    // Create channel
    const channelName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category,
      topic: `User: ${user.tag} (${user.id}) | Type: ${customId}`,
      permissionOverwrites,
    });

    // Ticket Embed
    const ticketEmbed = new EmbedBuilder()
      .setTitle(`${BRAND_EMOJIS[customId]} ${TICKET_TYPE_NAMES[customId]} Opened`)
      .addFields(
        { name: '👤 User', value: `<@${user.id}>`, inline: true },
        { name: '📁 Category', value: TICKET_TYPE_NAMES[customId], inline: true }
      )
      .setColor(BRAND_COLOR)
      .setFooter({ text: 'Regime Unit', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    // Buttons
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

    // Send initial message
    await ticketChannel.send({
      content: `<@${user.id}>`,
      embeds: [ticketEmbed],
      components: [row],
    });

    // Special instructions for Apply Staff
    if (customId === TYPES.APPLY_STAFF) {
      const staffAppEmbed = new EmbedBuilder()
        .setTitle('💼 Staff Application')
        .setDescription('Please answer the following questions in this channel:')
        .addFields(
          { name: '1. Why do you want to join the staff?', value: 'Write your answer...' },
          { name: '2. How much time can you dedicate weekly?', value: 'Write your answer...' },
          { name: '3. Previous moderation experience?', value: 'Write your answer...' },
          { name: '4. How old are you?', value: 'Write your answer...' },
          { name: '5. Timezone?', value: 'Write your answer...' },
          { name: '6. What sets you apart from others?', value: 'Write your answer...' },
          { name: '7. Describe your leadership style.', value: 'Write your answer...' },
          { name: '8. How do you handle conflict?', value: 'Write your answer...' },
          { name: '9. What is your biggest strength?', value: 'Write your answer...' },
          { name: '10. Biggest weakness?', value: 'Write your answer...' },
          { name: '11. How do you define teamwork?', value: 'Write your answer...' },
          { name: '12. Describe a time you resolved an issue.', value: 'Write your answer...' },
          { name: '13. What would you improve in this server?', value: 'Write your answer...' },
          { name: '14. How do you handle stress?', value: 'Write your answer...' },
          { name: '15. Preferred communication method?', value: 'Write your answer...' },
          { name: '16. Are you active on Discord daily?', value: 'Write your answer...' },
          { name: '17. What motivates you?', value: 'Write your answer...' },
          { name: '18. Any suggestions for the server?', value: 'Write your answer...' },
          { name: '19. Additional info?', value: 'Write your answer...' },
          { name: '20. Resume / Portfolio (link)', value: 'Paste a link or write "N/A"' }
        )
        .setColor('#FFD700')
        .setFooter({ text: 'Answer each question clearly. Staff will review shortly.' });

      await ticketChannel.send({ embeds: [staffAppEmbed] });
    }

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

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
  StringSelectMenuBuilder,
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
const REVIEWER_ROLE_ID = '1408876237266620508'; // Role that can accept/deny staff apps
const STAFF_APPLICATION_CHANNEL_ID = '1408876437976514633'; // Staff app review channel
const TICKET_OPEN_LOG_ID = '1408876441164054608'; // Open log
const TICKET_CLOSE_LOG_ID = '1408876442321686548'; // Close log
const BANNER_URL = 'https://www.stealthunitgg.xyz/money.png'; // Banner image
const INVITE_LINK = 'https://discord.gg/Gm877dFGHq'; // Invite to send on accept

// 🎟️ Ticket Types
const TYPES = {
  APPLY_TEAM: 'apply_team',
  APPLY_STAFF: 'apply_staff',
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

// 📝 Staff Application Questions
const STAFF_QUESTIONS = [
  'Why do you want to join the staff?',
  'How much time can you dedicate weekly?',
  'Previous moderation experience?',
  'How old are you?',
  'Timezone?',
  'What sets you apart from others?',
  'Describe your leadership style.',
  'How do you handle conflict?',
  'What is your biggest strength?',
  'Biggest weakness?',
  'How do you define teamwork?',
  'Describe a time you resolved an issue.',
  'What would you improve in this server?',
  'How do you handle stress?',
  'Preferred communication method?',
  'Are you active on Discord daily?',
  'What motivates you?',
  'Any suggestions for the server?',
  'Additional info?',
  'Resume / Portfolio (link)',
];

// 🗂️ Track active applications: channelId → { userId, answers: [] }
const activeApplications = new Map();

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

// 🎟️ Handle Button Interactions (Create Tickets)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, guild, member } = interaction;

  if (!Object.values(TYPES).includes(customId)) return;

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

    if (customId === TYPES.APPLY_STAFF) {
      // Only REVIEWER_ROLE can see staff apps
      permissionOverwrites.push({
        id: REVIEWER_ROLE_ID,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
      });
    } else if (customId === TYPES.SUPPORT || customId === TYPES.APPLY_TEAM) {
      permissionOverwrites.push({
        id: SUPPORT_ROLE_ID,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
      });
    } else if (customId === TYPES.CONTACT_OWNER) {
      permissionOverwrites.push({
        id: SUPPORT_ROLE_ID,
        deny: [PermissionsBitField.Flags.ViewChannel],
      });
    }

    const adminRole = guild.roles.cache.find(r => r.permissions.has(PermissionsBitField.Flags.Administrator));
    if (adminRole) {
      permissionOverwrites.push({
        id: adminRole.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels],
      });
    }

    const channelName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category,
      topic: `User: ${user.tag} (${user.id}) | Type: ${customId}`,
      permissionOverwrites,
    });

    const ticketEmbed = new EmbedBuilder()
      .setTitle(`${BRAND_EMOJIS[customId]} ${TICKET_TYPE_NAMES[customId]} Opened`)
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

    // 📜 Log open
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

    // 🔹 Start staff Q&A if needed
    if (customId === TYPES.APPLY_STAFF) {
      activeApplications.set(ticketChannel.id, {
        userId: user.id,
        answers: [],
        currentQuestionIndex: 0,
      });

      await askNextQuestion(ticketChannel);
    }
  } catch (err) {
    console.error(err);
    await interaction.editReply({ content: '❌ Failed to create ticket.' });
  }
});

// 🔹 Ask next question
async function askNextQuestion(channel) {
  const app = activeApplications.get(channel.id);
  if (!app || app.currentQuestionIndex >= STAFF_QUESTIONS.length) return;

  const question = STAFF_QUESTIONS[app.currentQuestionIndex];
  const qNum = app.currentQuestionIndex + 1;

  const embed = new EmbedBuilder()
    .setTitle(`💼 Staff Application • Question ${qNum}/20`)
    .setDescription(question)
    .setColor('#FFD700')
    .setFooter({ text: 'Please reply with your answer.' });

  await channel.send({ embeds: [embed] });
}

// 📥 Collect answers
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const app = activeApplications.get(message.channel.id);
  if (!app) return;

  const qIndex = app.currentQuestionIndex;
  app.answers[qIndex] = message.content.trim() || '(No answer provided)';

  app.currentQuestionIndex++;

  if (app.currentQuestionIndex < STAFF_QUESTIONS.length) {
    setTimeout(() => askNextQuestion(message.channel), 1200);
  } else {
    await finalizeStaffApplication(message.channel, app.userId, app.answers);
    activeApplications.delete(message.channel.id);

    await message.channel.send({
      content: '✅ Thank you! Your application has been submitted for review.',
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Application Submitted')
          .setDescription('Staff will review your answers shortly.')
          .setColor('#00FF00'),
      ],
    });

    // Auto-close after 5 seconds
    setTimeout(() => message.channel.delete().catch(console.error), 5000);
  }
});

// 📤 Send to staff review channel
async function finalizeStaffApplication(channel, userId, answers) {
  const user = await client.users.fetch(userId).catch(() => null);
  const guild = channel.guild;

  const appEmbed = new EmbedBuilder()
    .setTitle('💼 New Staff Application')
    .setDescription('A new staff application has been submitted. Please review and accept or deny.')
    .addFields(
      { name: '👤 Applicant', value: user ? `<@${userId}>` : `\`${userId}\``, inline: true },
      { name: '🆔 User ID', value: `\`${userId}\``, inline: true }
    )
    .setColor('#FF0000')
    .setTimestamp();

  // Add answers
  answers.forEach((ans, i) => {
    const q = STAFF_QUESTIONS[i];
    appEmbed.addFields({
      name: `Q${i + 1}: ${q.length > 40 ? q.slice(0, 40) + '...' : q}`,
      value: ans,
    });
  });

  const denyBtn = new ButtonBuilder()
    .setCustomId(`deny_staff_${userId}`)
    .setLabel('❌ Deny')
    .setStyle(ButtonStyle.Danger);

  // Role selector
  const roles = guild.roles.cache
    .filter(r =>
      r.id !== guild.id &&
      !r.managed &&
      r.editable &&
      r.name.toLowerCase() !== 'bot'
    )
    .sort((a, b) => b.position - a.position)
    .first(25);

  if (roles.size === 0) {
    console.error('No roles available for assignment');
    return;
  }

  const roleOptions = roles.map(r => ({
    label: r.name.substring(0, 80),
    description: `Pos: ${r.position}`,
    value: r.id,
  }));

  const roleMenu = new StringSelectMenuBuilder()
    .setCustomId(`accept_staff_${userId}`)
    .setPlaceholder('✅ Accept & Assign Role')
    .addOptions(roleOptions);

  const actionRow1 = new ActionRowBuilder().addComponents(denyBtn);
  const actionRow2 = new ActionRowBuilder().addComponents(roleMenu);

  const staffChannel = client.channels.cache.get(STAFF_APPLICATION_CHANNEL_ID);
  if (staffChannel) {
    await staffChannel.send({
      content: `<@&${REVIEWER_ROLE_ID}>`,
      embeds: [appEmbed],
      components: [actionRow1, actionRow2],
    });
  } else {
    console.error('Staff application channel not found.');
  }
}

// ✅ Handle Accept/Deny
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('deny_staff_')) {
      const userId = interaction.customId.split('_')[2];
      const user = await client.users.fetch(userId).catch(() => null);

      const embed = new EmbedBuilder()
        .setTitle('❌ Application Denied')
        .setDescription(user ? `Application from ${user} has been denied.` : 'Application denied.')
        .setColor('#FF0000');

      await interaction.update({ embeds: [embed], components: [] });

      if (user) {
        user.send('❌ Your staff application was denied.').catch(() => {});
      }
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('accept_staff_')) {
      const userId = interaction.customId.split('_')[2];
      const selectedRoleId = interaction.values[0];
      const user = await client.users.fetch(userId).catch(() => null);
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      const role = await interaction.guild.roles.fetch(selectedRoleId);

      const roleName = role ? role.name : 'Unknown Role';

      const embed = new EmbedBuilder()
        .setTitle('✅ Application Accepted')
        .setDescription(`Accepted and assigned: **${roleName}**`)
        .setColor('#00FF00');

      await interaction.update({ embeds: [embed], components: [] });

      if (member && role) {
        await member.roles.add(role).catch(console.error);
      }

      if (user) {
        user.send(`🎉 Congratulations! You've been accepted as staff.\n\n🔗 Join the team: ${INVITE_LINK}`).catch(() => {});
      }
    }
  }
});

// 🔒 Handle Close & Claim Ticket Buttons
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, channel, member, guild } = interaction;

  if (customId === 'close_ticket') {
    if (!channel.name.startsWith('ticket-')) {
      return await interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🔒 Closing Ticket')
      .setDescription('Deleting in 5 seconds...')
      .setColor('#FF0000');
    await interaction.reply({ embeds: [embed] });

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

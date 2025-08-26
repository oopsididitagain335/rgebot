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
app.get('/', (req, res) => res.send('<h1>Regime Unit Ticket Bot</h1><p>✅ Bot is online and connected.</p>'));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// 🤖 Discord Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// 🔧 Config
const CONFIG = {
  CATEGORY_ID: '1408931971811512420',
  SUPPORT_ROLE: '1409167134831022242',
  REVIEWER_ROLE: '1408876237266620508',
  STAFF_REVIEW_CHANNEL: '1408876437976514633',
  LOG_OPEN: '1408876441164054608',
  LOG_CLOSE: '1408876442321686548',
  BANNER: 'https://www.stealthunitgg.xyz/money.png',
  INVITE: 'https://discord.gg/Gm877dFGHq',
  BRAND: {
    NAME: 'Regime Unit',
    COLOR: '#000000',
    EMOJIS: {
      apply_team: '🎯',
      apply_staff: '💼',
      support: '🛠️',
      contact_owner: '👑',
      close: '🔒',
      claim: '🔖',
    },
  },
};

// 🎟️ Ticket Types
const TYPES = {
  APPLY_TEAM: 'apply_team',
  APPLY_STAFF: 'apply_staff',
  SUPPORT: 'support',
  CONTACT_OWNER: 'contact_owner',
};

const TYPE_NAMES = {
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

const activeApplications = new Map();

// ✅ Ready
client.once('ready', () => {
  console.log(`✅ ${client.user.tag} is online!`);
});

// 🛠️ Send Ticket Panel
client.on('messageCreate', async (msg) => {
  if (msg.content !== '!ticketpanel') return;
  if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const embed = new EmbedBuilder()
    .setTitle(`${CONFIG.BRAND.EMOJIS.contact_owner} Open a Ticket`)
    .setDescription('Choose a ticket type below to get assistance.')
    .setImage(CONFIG.BANNER)
    .setColor(CONFIG.BRAND.COLOR)
    .setFooter({ text: CONFIG.BRAND.NAME, iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(TYPES.APPLY_TEAM).setLabel('Apply Team').setStyle(ButtonStyle.Primary).setEmoji(CONFIG.BRAND.EMOJIS.apply_team),
    new ButtonBuilder().setCustomId(TYPES.APPLY_STAFF).setLabel('Apply Staff').setStyle(ButtonStyle.Danger).setEmoji(CONFIG.BRAND.EMOJIS.apply_staff)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(TYPES.SUPPORT).setLabel('Support').setStyle(ButtonStyle.Success).setEmoji(CONFIG.BRAND.EMOJIS.support),
    new ButtonBuilder().setCustomId(TYPES.CONTACT_OWNER).setLabel('Contact Owner').setStyle(ButtonStyle.Secondary).setEmoji(CONFIG.BRAND.EMOJIS.contact_owner)
  );

  await msg.channel.send({ embeds: [embed], components: [row1, row2] });
});

// 🎟️ Ticket Creation
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, user, guild } = interaction;
  if (!Object.values(TYPES).includes(customId)) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const category = guild.channels.cache.get(CONFIG.CATEGORY_ID);
    if (!category) return interaction.editReply('❌ Ticket category not found.');

    const overwrites = [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
    ];

    if (customId === TYPES.APPLY_STAFF) {
      overwrites.push({ id: CONFIG.REVIEWER_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
    } else if ([TYPES.SUPPORT, TYPES.APPLY_TEAM].includes(customId)) {
      overwrites.push({ id: CONFIG.SUPPORT_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
    }

    const adminRole = guild.roles.cache.find(r => r.permissions.has(PermissionsBitField.Flags.Administrator));
    if (adminRole) overwrites.push({ id: adminRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels] });

    const ticketChannel = await guild.channels.create({
      name: `ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      type: ChannelType.GuildText,
      parent: category,
      topic: `User: ${user.tag} | Type: ${customId}`,
      permissionOverwrites: overwrites,
    });

    const ticketEmbed = new EmbedBuilder()
      .setTitle(`${CONFIG.BRAND.EMOJIS[customId]} ${TYPE_NAMES[customId]} Ticket`)
      .addFields(
        { name: '👤 User', value: `<@${user.id}>`, inline: true },
        { name: '📁 Type', value: TYPE_NAMES[customId], inline: true }
      )
      .setColor(CONFIG.BRAND.COLOR)
      .setImage(CONFIG.BANNER)
      .setFooter({ text: CONFIG.BRAND.NAME, iconURL: client.user.displayAvatarURL() });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji(CONFIG.BRAND.EMOJIS.close),
      new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Primary).setEmoji(CONFIG.BRAND.EMOJIS.claim)
    );

    await ticketChannel.send({ content: `<@${user.id}>`, embeds: [ticketEmbed], components: [row] });

    // Log
    const logChannel = guild.channels.cache.get(CONFIG.LOG_OPEN);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🎫 Ticket Opened')
        .setDescription(`Type: **${TYPE_NAMES[customId]}**\nChannel: ${ticketChannel}`)
        .setColor('#00FF00')
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] });
    }

    await interaction.editReply(`✅ Ticket created: ${ticketChannel}`);

    // Start staff Q&A
    if (customId === TYPES.APPLY_STAFF) {
      activeApplications.set(ticketChannel.id, { userId: user.id, answers: [], index: 0 });
      askNextQuestion(ticketChannel);
    }
  } catch (err) {
    console.error(err);
    interaction.editReply('❌ Failed to create ticket.');
  }
});

// 🔹 Ask staff questions
async function askNextQuestion(channel) {
  const app = activeApplications.get(channel.id);
  if (!app || app.index >= STAFF_QUESTIONS.length) return;

  const q = STAFF_QUESTIONS[app.index];
  const embed = new EmbedBuilder()
    .setTitle(`💼 Staff Application — Q${app.index + 1}/${STAFF_QUESTIONS.length}`)
    .setDescription(q)
    .setColor('#FFD700')
    .setFooter({ text: 'Please reply with your answer.' });

  channel.send({ embeds: [embed] });
}

// 📥 Collect staff answers
client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  const app = activeApplications.get(msg.channel.id);
  if (!app || msg.author.id !== app.userId) return;

  app.answers[app.index] = msg.content.trim() || '(No answer)';
  app.index++;

  if (app.index < STAFF_QUESTIONS.length) {
    setTimeout(() => askNextQuestion(msg.channel), 1200);
  } else {
    finalizeStaffApplication(msg.channel, app.userId, app.answers);
    activeApplications.delete(msg.channel.id);
    msg.channel.send('✅ Thank you! Your application has been submitted for review.');
    setTimeout(() => msg.channel.delete().catch(() => {}), 7000);
  }
});

// 🔒 Ticket Controls
client.on('interactionCreate', async (i) => {
  if (!i.isButton()) return;

  if (i.customId === 'close_ticket') {
    await i.reply('🔒 Closing ticket in 5s...');
    const log = i.guild.channels.cache.get(CONFIG.LOG_CLOSE);
    if (log) log.send(`🗑️ Ticket ${i.channel} closed by ${i.user}`);
    setTimeout(() => i.channel.delete().catch(() => {}), 5000);
  }

  if (i.customId === 'claim_ticket') {
    const member = i.member;
    if (!member.roles.cache.has(CONFIG.SUPPORT_ROLE) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return i.reply({ content: '❌ You cannot claim this ticket.', ephemeral: true });
    }
    i.reply(`🔖 Ticket claimed by ${i.user}`);
  }
});

// 🚀 Login
client.login(process.env.TOKEN);

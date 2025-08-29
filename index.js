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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const express = require('express');

// 🌐 Express Web Server
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('<h1>Dev Hub Ticket Bot</h1><p>✅ Bot is online.</p>'));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// 🤖 Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 🔧 Config
const CONFIG = {
  LOG_OPEN: '1408876441164054608',
  LOG_CLOSE: '1408876442321686548',
  LOG_PURCHASE: '1410995321206738964',
  LOG_SCAM: '1410999473513173003',
  ROLES: {
    SUPPORT: '1410995216810377337',
    PURCHASE: '1410995216810377337',
    CONTACT_OWNER: '1410995227870760960',
  },
  BRAND: {
    NAME: 'Dev Hub',
    COLOR: '#000000',
    EMOJIS: {
      purchase_bot: '💎',
      purchase_website: '💰',
      support: '🛠️',
      contact_owner: '👑',
      apply_staff: '💼',
      close: '🔒',
      claim: '🔖',
    },
  },
};

// 🎟️ Ticket Types
const TYPES = {
  PURCHASE_BOT: 'purchase_bot',
  PURCHASE_WEBSITE: 'purchase_website',
  SUPPORT: 'support',
  CONTACT_OWNER: 'contact_owner',
  APPLY_STAFF: 'apply_staff',
};

const TYPE_NAMES = {
  [TYPES.PURCHASE_BOT]: 'Purchase Bot',
  [TYPES.PURCHASE_WEBSITE]: 'Purchase Website',
  [TYPES.SUPPORT]: 'Support',
  [TYPES.CONTACT_OWNER]: 'Contact Owner',
  [TYPES.APPLY_STAFF]: 'Moderator Application',
};

// Staff application questions for dev hub
const STAFF_QUESTIONS = [
  'Why do you want to join as a moderator/admin in this dev hub?',
  'How much time can you dedicate weekly?',
  'Do you have experience handling support requests or development tasks?',
  'How would you handle a user reporting a bug or issue?',
  'How do you collaborate with a team remotely?',
  'What motivates you to maintain server quality?',
  'Describe a time you solved a problem under pressure.',
  'Any suggestions to improve this server or our systems?',
];

const activeApplications = new Map();

// ✅ Ready
client.once('ready', () => console.log(`✅ ${client.user.tag} is online!`));

// 🛠️ Helpers
async function ensureCategory(guild, typeName) {
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === typeName.toLowerCase()
  );
  if (!category) {
    category = await guild.channels.create({ name: typeName, type: ChannelType.GuildCategory });
  }
  return category;
}

function getRoleForType(type) {
  switch (type) {
    case TYPES.SUPPORT:
      return CONFIG.ROLES.SUPPORT;
    case TYPES.PURCHASE_BASIC:
    case TYPES.PURCHASE_PREMIUM:
      return CONFIG.ROLES.PURCHASE;
    case TYPES.CONTACT_OWNER:
      return CONFIG.ROLES.CONTACT_OWNER;
    default:
      return null;
  }
}

// 🛠️ Ticket Panel
client.on('messageCreate', async (msg) => {
  if (msg.content !== '!ticketpanel') return;
  if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const embed = new EmbedBuilder()
    .setTitle(`${CONFIG.BRAND.EMOJIS.contact_owner} Open a Ticket`)
    .setDescription('Choose a ticket type to open.')
    .setColor(CONFIG.BRAND.COLOR)
    .setFooter({ text: CONFIG.BRAND.NAME });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(TYPES.PURCHASE_BASIC).setLabel('Purchase Basic').setStyle(ButtonStyle.Primary).setEmoji(CONFIG.BRAND.EMOJIS.purchase_basic),
    new ButtonBuilder().setCustomId(TYPES.PURCHASE_PREMIUM).setLabel('Purchase Premium').setStyle(ButtonStyle.Success).setEmoji(CONFIG.BRAND.EMOJIS.purchase_premium),
    new ButtonBuilder().setCustomId(TYPES.SUPPORT).setLabel('Support').setStyle(ButtonStyle.Secondary).setEmoji(CONFIG.BRAND.EMOJIS.support),
    new ButtonBuilder().setCustomId(TYPES.CONTACT_OWNER).setLabel('Contact Owner').setStyle(ButtonStyle.Danger).setEmoji(CONFIG.BRAND.EMOJIS.contact_owner),
    new ButtonBuilder().setCustomId(TYPES.APPLY_STAFF).setLabel('Moderator Application').setStyle(ButtonStyle.Primary).setEmoji(CONFIG.BRAND.EMOJIS.apply_staff)
  );

  await msg.channel.send({ embeds: [embed], components: [row] });
});

// 🎟️ Handle ticket/modals
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    const type = interaction.customId;
    if (!Object.values(TYPES).includes(type)) return;

    const category = await ensureCategory(interaction.guild, TYPE_NAMES[type]);
    const roleId = getRoleForType(type);

    const overwrites = [
      { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
    ];
    if (roleId) overwrites.push({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });

    const ticketChannel = await interaction.guild.channels.create({
      name: `${type}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      type: ChannelType.GuildText,
      parent: category,
      permissionOverwrites: overwrites,
      topic: `User: ${interaction.user.tag} | Type: ${type}`,
    });

    const ticketEmbed = new EmbedBuilder()
      .setTitle(`${CONFIG.BRAND.EMOJIS[type]} ${TYPE_NAMES[type]} Ticket`)
      .addFields({ name: '👤 User', value: `<@${interaction.user.id}>`, inline: true }, { name: '📁 Type', value: TYPE_NAMES[type], inline: true })
      .setColor(CONFIG.BRAND.COLOR)
      .setFooter({ text: CONFIG.BRAND.NAME });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji(CONFIG.BRAND.EMOJIS.close),
      new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Primary).setEmoji(CONFIG.BRAND.EMOJIS.claim)
    );

    await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [ticketEmbed], components: [row] });

    // Logging
    const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_OPEN);
    if (logChannel) logChannel.send({ embeds: [new EmbedBuilder().setTitle('🎫 Ticket Opened').setDescription(`Type: **${TYPE_NAMES[type]}**\nChannel: ${ticketChannel}`).setColor('#00FF00').setTimestamp()] });

    await interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });

    // Staff application questions
    if (type === TYPES.APPLY_STAFF) {
      activeApplications.set(ticketChannel.id, { userId: interaction.user.id, answers: [], index: 0 });
      askNextQuestion(ticketChannel);
    }

    // Purchase modals
    if ([TYPES.PURCHASE_BASIC, TYPES.PURCHASE_PREMIUM].includes(type)) {
      const modal = new ModalBuilder().setCustomId(`purchase_${type}`).setTitle('Purchase Request');
      const productInput = new TextInputBuilder().setCustomId('product').setLabel('What are you buying?').setStyle(TextInputStyle.Short).setRequired(true);
      const detailsInput = new TextInputBuilder().setCustomId('details').setLabel('Any extra details?').setStyle(TextInputStyle.Paragraph).setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(productInput), new ActionRowBuilder().addComponents(detailsInput));
      await interaction.showModal(modal);
    }
  }

  // Modals
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('purchase_')) {
      const product = interaction.fields.getTextInputValue('product');
      const details = interaction.fields.getTextInputValue('details') || '(No details)';
      const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_PURCHASE);
      if (logChannel) logChannel.send({
        content: `💎 Purchase Request by <@${interaction.user.id}>`,
        embeds: [{ title: 'Purchase Details', fields: [{ name: 'Product', value: product }, { name: 'Extra Info', value: details }, { name: 'Type', value: TYPE_NAMES[interaction.customId.replace('purchase_', '')] }], color: CONFIG.BRAND.COLOR, timestamp: new Date() }],
      });
      await interaction.reply({ content: '✅ Your purchase request has been submitted!', ephemeral: true });
    }
  }
});

// 🔹 Staff application Q&A
async function askNextQuestion(channel) {
  const app = activeApplications.get(channel.id);
  if (!app || app.index >= STAFF_QUESTIONS.length) return;

  const q = STAFF_QUESTIONS[app.index];
  const embed = new EmbedBuilder().setTitle(`💼 Moderator Application — Q${app.index + 1}/${STAFF_QUESTIONS.length}`).setDescription(q).setColor('#FFD700').setFooter({ text: 'Reply with your answer.' });
  await channel.send({ embeds: [embed] });
}

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  const app = activeApplications.get(msg.channel.id);
  if (!app || msg.author.id !== app.userId) return;

  app.answers[app.index] = msg.content.trim() || '(No answer)';
  app.index++;

  if (app.index < STAFF_QUESTIONS.length) {
    setTimeout(() => askNextQuestion(msg.channel), 1000);
  } else {
    activeApplications.delete(msg.channel.id);
    msg.channel.send('✅ Your application has been submitted for review.');
    setTimeout(() => msg.channel.delete().catch(() => {}), 7000);
  }
});

// 🔒 Ticket Controls + Claim
client.on('interactionCreate', async (i) => {
  if (!i.isButton()) return;
  if (i.customId === 'close_ticket') {
    await i.reply('🔒 Closing ticket in 5s...');
    const log = i.guild.channels.cache.get(CONFIG.LOG_CLOSE);
    if (log) log.send(`🗑️ Ticket ${i.channel} closed by ${i.user}`);
    setTimeout(() => i.channel.delete().catch(() => {}), 5000);
  }
  if (i.customId === 'claim_ticket') {
    if (!i.member.roles.cache.has(CONFIG.ROLES.SUPPORT)) return i.reply({ content: '❌ Cannot claim ticket.', ephemeral: true });
    i.reply(`🔖 Ticket claimed by ${i.user}`);
  }
});

// 💻 Commands for marking purchase success/failure & scammer
client.on('messageCreate', async (msg) => {
  if (!msg.guild || !msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  const args = msg.content.split(' ');
  if (args[0] === '!purchase' && args[1] && args[2]) {
    const [_, status, userId] = args;
    const logChannel = msg.guild.channels.cache.get(CONFIG.LOG_PURCHASE);
    if (logChannel) logChannel.send(`${status.toUpperCase()} purchase for <@${userId}>`);
    msg.reply(`✅ Logged purchase status: ${status}`);
  }

  if (args[0] === '!scammer' && args[1]) {
    const userId = args[1].replace(/[<@!>]/g, '');
    const logChannel = msg.guild.channels.cache.get(CONFIG.LOG_SCAM);
    if (logChannel) logChannel.send(`⚠️ User <@${userId}> marked as a scammer by ${msg.author}`);
    msg.reply(`✅ Marked <@${userId}> as a scammer.`);
  }
});

// 🚀 Login
client.login(process.env.TOKEN);

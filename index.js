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
  LOG_PURCHASE: '1410995321206738964', // Logs purchase requests (with over-minimum)
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

// Staff application questions
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
    case TYPES.SUPPORT: return CONFIG.ROLES.SUPPORT;
    case TYPES.PURCHASE_BOT:
    case TYPES.PURCHASE_WEBSITE: return CONFIG.ROLES.PURCHASE;
    case TYPES.CONTACT_OWNER: return CONFIG.ROLES.CONTACT_OWNER;
    default: return null;
  }
}

// 🛠️ Ticket Panel + Admin Commands + Help
client.on('messageCreate', async (msg) => {
  if (!msg.guild) return;

  // === Ticket Panel ===
  if (msg.content === '!ticketpanel') {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const embed = new EmbedBuilder()
      .setTitle(`${CONFIG.BRAND.EMOJIS.contact_owner} Open a Ticket`)
      .setDescription('Click a button to open a ticket.')
      .setColor(CONFIG.BRAND.COLOR)
      .setFooter({ text: CONFIG.BRAND.NAME });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(TYPES.PURCHASE_BOT)
        .setLabel('Purchase Bot')
        .setStyle(ButtonStyle.Primary)
        .setEmoji(CONFIG.BRAND.EMOJIS.purchase_bot),
      new ButtonBuilder()
        .setCustomId(TYPES.PURCHASE_WEBSITE)
        .setLabel('Purchase Website')
        .setStyle(ButtonStyle.Success)
        .setEmoji(CONFIG.BRAND.EMOJIS.purchase_website),
      new ButtonBuilder()
        .setCustomId(TYPES.SUPPORT)
        .setLabel('Support')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(CONFIG.BRAND.EMOJIS.support),
      new ButtonBuilder()
        .setCustomId(TYPES.CONTACT_OWNER)
        .setLabel('Contact Owner')
        .setStyle(ButtonStyle.Danger)
        .setEmoji(CONFIG.BRAND.EMOJIS.contact_owner),
      new ButtonBuilder()
        .setCustomId(TYPES.APPLY_STAFF)
        .setLabel('Moderator Application')
        .setStyle(ButtonStyle.Primary)
        .setEmoji(CONFIG.BRAND.EMOJIS.apply_staff)
    );

    await msg.channel.send({ embeds: [embed], components: [row] });
  }

  // === Admin Commands: !purchase, !scammer ===
  if (msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const args = msg.content.split(' ');

    // ✅ Purchase logging
    if (args[0] === '!purchase' && args[1] && args[2]) {
      const [_, status, userId] = args;
      const logChannel = msg.guild.channels.cache.get(CONFIG.LOG_PURCHASE);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('💎 Purchase Update')
          .setDescription(`**Status:** ${status.toUpperCase()}\n**User:** <@${userId}>`)
          .setColor(status.toLowerCase() === 'success' ? 'GREEN' : 'RED')
          .setTimestamp()
          .setFooter({ text: CONFIG.BRAND.NAME });
        logChannel.send({ embeds: [embed] });
      }
      msg.reply(`✅ Logged purchase status: ${status}`);
    }

    // ⚠️ Scammer logging
    if (args[0] === '!scammer' && args[1]) {
      const userId = args[1].replace(/[<@!>]/g, '');
      const reason = args.slice(2).join(' ') || 'No reason provided';
      const logChannel = msg.guild.channels.cache.get(CONFIG.LOG_SCAM);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Scammer Report')
          .addFields(
            { name: 'User', value: `<@${userId}>`, inline: true },
            { name: 'Reported By', value: `<@${msg.author.id}>`, inline: true },
            { name: 'Reason', value: reason }
          )
          .setColor('#FF0000')
          .setTimestamp()
          .setFooter({ text: CONFIG.BRAND.NAME });
        logChannel.send({ embeds: [embed] });
      }
      msg.reply(`✅ Marked <@${userId}> as a scammer. Reason: ${reason}`);
    }
  }

  // === Help Command ===
  if (msg.content === '!help') {
    const embed = new EmbedBuilder()
      .setTitle('📖 Dev Hub Bot Commands')
      .setDescription('Here is a list of available commands:')
      .addFields(
        { name: '!ticketpanel', value: 'Admin only. Sends the ticket panel with all ticket buttons.', inline: false },
        { name: '!purchase <status> <userID>', value: 'Admin only. Logs purchase status for a user.', inline: false },
        { name: '!scammer <userID> <reason>', value: 'Admin only. Marks a user as a scammer with optional reason.', inline: false },
        { name: '!help', value: 'Shows this help message.', inline: false }
      )
      .setColor(CONFIG.BRAND.COLOR)
      .setFooter({ text: CONFIG.BRAND.NAME })
      .setTimestamp();

    await msg.channel.send({ embeds: [embed] });
  }
});

// 🎟️ Ticket buttons and modals
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  // === BUTTONS ===
  if (interaction.isButton()) {
    const type = interaction.customId;

    // Close Ticket
    if (type === 'close_ticket') {
      await interaction.reply('🔒 Closing ticket in 5s...');
      const log = interaction.guild.channels.cache.get(CONFIG.LOG_CLOSE);
      if (log) log.send({
        embeds: [new EmbedBuilder()
          .setTitle('🗑️ Ticket Closed')
          .setDescription(`Channel: ${interaction.channel}\nClosed by: ${interaction.user}`)
          .setColor('#FF0000')
          .setTimestamp()]
      });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      return;
    }

    // Claim Ticket
    if (type === 'claim_ticket') {
      if (!interaction.member.roles.cache.has(CONFIG.ROLES.SUPPORT)) {
        return interaction.reply({ content: '❌ Cannot claim ticket.', ephemeral: true });
      }
      return interaction.reply(`🔖 Ticket claimed by ${interaction.user}`);
    }

    // Only continue for valid ticket types
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
      .addFields(
        { name: '👤 User', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📁 Type', value: TYPE_NAMES[type], inline: true }
      )
      .setColor(CONFIG.BRAND.COLOR)
      .setFooter({ text: CONFIG.BRAND.NAME });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji(CONFIG.BRAND.EMOJIS.close),
      new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Primary).setEmoji(CONFIG.BRAND.EMOJIS.claim)
    );

    await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [ticketEmbed], components: [row] });

    // Log ticket open
    const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_OPEN);
    if (logChannel) logChannel.send({
      embeds: [new EmbedBuilder()
        .setTitle('🎫 Ticket Opened')
        .setDescription(`Type: **${TYPE_NAMES[type]}**\nChannel: ${ticketChannel}`)
        .setColor('#00FF00')
        .setTimestamp()]
    });

    await interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });

    // Staff application
    if (type === TYPES.APPLY_STAFF) {
      activeApplications.set(ticketChannel.id, { userId: interaction.user.id, answers: [], index: 0 });
      askNextQuestion(ticketChannel);
    }

    // Purchase modal with budget check
    if ([TYPES.PURCHASE_BOT, TYPES.PURCHASE_WEBSITE].includes(type)) {
      const modal = new ModalBuilder()
        .setCustomId(`purchase_${type}`)
        .setTitle('Purchase Request');

      const productInput = new TextInputBuilder()
        .setCustomId('product')
        .setLabel('What are you buying?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g. Discord Bot, Website Template');

      const budgetInput = new TextInputBuilder()
        .setCustomId('budget')
        .setLabel('What is your budget?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder(
          type === TYPES.PURCHASE_BOT
            ? 'Minimum £15 (e.g. 20, 30, 50)'
            : 'Minimum £10 (e.g. 15, 25)'
        );

      const detailsInput = new TextInputBuilder()
        .setCustomId('details')
        .setLabel('Any extra details?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Timeline, features, etc.');

      modal.addComponents(
        new ActionRowBuilder().addComponents(productInput),
        new ActionRowBuilder().addComponents(budgetInput),
        new ActionRowBuilder().addComponents(detailsInput)
      );

      return interaction.showModal(modal);
    }
  }

  // === MODALS ===
  if (interaction.isModalSubmit() && interaction.customId.startsWith('purchase_')) {
    const type = interaction.customId.replace('purchase_', '');
    const product = interaction.fields.getTextInputValue('product');
    const budgetText = interaction.fields.getTextInputValue('budget');
    const details = interaction.fields.getTextInputValue('details') || '(No details)';

    // Parse budget safely
    const budget = parseFloat(budgetText.replace(/[^\d.]/g, ''));
    if (isNaN(budget)) {
      return interaction.reply({
        content: '❌ Please enter a valid number for your budget (e.g. 15, 20.50).',
        ephemeral: true,
      });
    }

    const minBudget = type === TYPES.PURCHASE_BOT ? 15 : 10;
    const overBudget = Math.max(0, budget - minBudget);

    if (budget < minBudget) {
      return interaction.reply({
        content: `❌ Your budget (£${budget}) is below the minimum for this service.\n> 📌 Minimum: **£${minBudget}**\n> 💡 Consider increasing your budget to proceed.`,
        ephemeral: true,
      });
    }

    // ✅ Log purchase request with over-minimum info
    const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_PURCHASE);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle('💎 Purchase Request Submitted')
        .addFields(
          { name: '👤 User', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📌 Request Type', value: TYPE_NAMES[type], inline: true },
          { name: '📦 Product', value: product },
          { name: '💷 Budget Offered', value: `£${budget.toFixed(2)}`, inline: true },
          { name: '✅ Minimum Required', value: `£${minBudget}`, inline: true },
          { name: '📈 Above Minimum', value: `£${overBudget.toFixed(2)}`, inline: true },
          { name: '📄 Details', value: details }
        )
        .setColor('#00FF00')
        .setTimestamp()
        .setFooter({ text: CONFIG.BRAND.NAME });

      logChannel.send({ embeds: [embed] });
    }

    // Confirm to user
    await interaction.reply({
      content: `✅ Thank you! Your **${TYPE_NAMES[type]}** request has been submitted.\n> 💵 Budget: **£${budget}** (✓ £${overBudget} above minimum)`,
      ephemeral: true,
    });
  }
});

// 🔹 Staff Application Q&A
async function askNextQuestion(channel) {
  const app = activeApplications.get(channel.id);
  if (!app || app.index >= STAFF_QUESTIONS.length) return;

  const q = STAFF_QUESTIONS[app.index];
  const embed = new EmbedBuilder()
    .setTitle(`💼 Moderator Application — Q${app.index + 1}/${STAFF_QUESTIONS.length}`)
    .setDescription(q)
    .setColor('#FFD700')
    .setFooter({ text: 'Reply with your answer.' });
  await channel.send({ embeds: [embed] });
}

// Listen for application answers
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

// 🚀 Login
client.login(process.env.TOKEN);

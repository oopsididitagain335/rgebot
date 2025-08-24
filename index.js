require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionsBitField,
  StringSelectMenuBuilder,
} = require('discord.js');

const express = require('express'); // For port binding

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// 🌐 Start Express App (for hosting platforms)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <h1>Regime Unit Ticket Bot</h1>
    <p>✅ Bot is running and connected to Discord.</p>
    <p><em>This service manages tickets and staff applications.</em></p>
  `);
});

app.listen(PORT, () => {
  console.log(`🌐 Web server is running on port ${PORT}`);
});

// 🔧 Hardcoded IDs
const TICKET_CATEGORY_ID = '1408931971811512420'; // Ticket category
const STAFF_APPLICATION_CHANNEL_ID = '1408876357529768130'; // Staff review channel
const SUPPORT_ROLE_ID = '1409167134831022242'; // Support team role
const BANNER_URL = 'https://www.stealthunitgg.xyz/money.png'; // Hosted banner (image only)

// 🎟️ Ticket Types
const TYPES = {
  APPLY_TEAM: 'apply_team',
  APPLY_STAFF: 'apply_staff',
  SUPPORT: 'support',
  CONTACT_OWNER: 'contact_owner',
};

// 🎨 Branding & Emojis
const BRAND_COLOR = '#000000'; // Sleek black theme
const BRAND_EMOJIS = {
  apply_team: '🎯',
  apply_staff: '💼',
  support: '🛠️',
  contact_owner: '👑',
  close: '🔒',
  claim: '🔖',
};

client.once('ready', () => {
  console.log(`✅ ${client.user.tag} is online and ready!`);
});

// 🛠️ Send ticket panel (Admins only)
client.on('messageCreate', async (message) => {
  if (message.content === '!ticketpanel' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const embed = new EmbedBuilder()
      .setTitle(`${BRAND_EMOJIS.contact_owner} Welcome to Regime Unit`)
      .setDescription(
        'Choose a ticket type below to get assistance.\n\n' +
        `**${BRAND_EMOJIS.apply_team} Apply Team** — Join our team\n` +
        `**${BRAND_EMOJIS.apply_staff} Apply Staff** — Become part of the staff (Admin Review)\n` +
        `**${BRAND_EMOJIS.support} Support** — Need help with something?\n` +
        `**${BRAND_EMOJIS.contact_owner} Contact Owner** — For private or urgent matters`
      )
      .setImage(BANNER_URL)
      .setColor(BRAND_COLOR)
      .setFooter({ text: 'Regime Unit • Secure & Professional', iconURL: client.user.displayAvatarURL() })
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

// 🎟️ Handle ticket button clicks
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, guild, member } = interaction;

  if (!Object.values(TYPES).includes(customId)) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    if (customId === TYPES.APPLY_STAFF) {
      // 💼 Apply Staff: DM 20 questions
      const dmChannel = await user.createDM().catch(() => null);
      if (!dmChannel) {
        return interaction.editReply({ content: '❌ I couldn’t send you a DM. Please enable DMs from server members.' });
      }

      const modal = new ModalBuilder()
        .setCustomId('apply_staff_modal')
        .setTitle('💼 Staff Application');

      const questions = Array.from({ length: 19 }, (_, i) =>
        new TextInputBuilder()
          .setCustomId(`q${i + 1}`)
          .setLabel(`Question ${i + 1}`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      );

      const resumeInput = new TextInputBuilder()
        .setCustomId('resume')
        .setLabel('📄 Resume (PDF/Drive link)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://drive.example.com/resume')
        .setRequired(false);

      const rows = questions.slice(0, 5).map(q => new ActionRowBuilder().addComponents(q));
      rows.push(new ActionRowBuilder().addComponents(resumeInput));

      modal.addComponents(...rows);

      await interaction.showModal(modal);
      client.application.set('pendingStaffApp', user.id);

    } else {
      // 🎫 Create ticket: Apply Team, Support, Contact Owner
      const category = guild.channels.cache.get(TICKET_CATEGORY_ID);
      if (!category) return interaction.editReply({ content: '❌ Ticket category not found.' });

      let permissionOverwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ];

      if (customId === TYPES.SUPPORT || customId === TYPES.APPLY_TEAM) {
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

      const channelName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category,
        topic: `User: ${user.tag} (${user.id}) | Type: ${customId}`,
        permissionOverwrites,
      });

      const ticketEmbed = new EmbedBuilder()
        .setTitle(`${BRAND_EMOJIS[customId]} Ticket Opened`)
        .setDescription('A member of the team will assist you shortly. Please provide details about your request.')
        .addFields({ name: '👤 User', value: `<@${user.id}>`, inline: true })
        .setColor(BRAND_COLOR)
        .setFooter({ text: 'Regime Unit', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      const closeBtn = new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger)
        .setEmoji(BRAND_EMOJIS.close);

      const claimBtn = new ButtonBuilder()
        .setCustomId('claim_ticket')
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary)
        .setEmoji(BRAND_EMOJIS.claim);

      const row = new ActionRowBuilder().addComponents(closeBtn, claimBtn);

      await ticketChannel.send({
        content: `<@${user.id}>`,
        embeds: [ticketEmbed],
        components: [row],
      });

      await interaction.editReply({
        content: `✅ Ticket created: ${ticketChannel}`,
        ephemeral: true,
      });
    }
  } catch (err) {
    conso

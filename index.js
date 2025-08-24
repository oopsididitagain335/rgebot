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
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Start web server (for hosting platforms)
app.get('/', (req, res) => {
  res.send('<h1>Regime Unit Ticket Bot</h1><p>✅ Running and connected to Discord.</p>');
});
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

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
const STAFF_APPLICATION_CHANNEL_ID = '1408876357529768130'; // Staff review
const SUPPORT_ROLE_ID = '1409167134831022242'; // Support role
const TICKET_OPEN_LOG_ID = '1408876441164054608'; // Open log
const TICKET_CLOSE_LOG_ID = '1408876442321686548'; // Close log
const BANNER_URL = 'https://www.stealthunitgg.xyz/money.png'; // Banner image only

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
  [TYPES.SUPPORT]: 'Support',
  [TYPES.CONTACT_OWNER]: 'Contact Owner',
};

client.once('ready', () => {
  console.log(`✅ ${client.user.tag} is online!`);
});

// 🛠️ Send ticket panel (Admin only)
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

// 🎟️ Handle Button Clicks
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, guild, member } = interaction;

  if (!Object.values(TYPES).includes(customId)) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    if (customId === TYPES.APPLY_STAFF) {
      // 💼 Apply Staff: Send 20 questions via DM
      const dmChannel = await user.createDM().catch(() => null);
      if (!dmChannel) {
        return interaction.editReply({ content: '❌ I couldn’t DM you. Please enable DMs from server members.' });
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
        .setLabel('📄 Resume (PDF/Drive Link)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://drive.example.com/resume')
        .setRequired(false);

      const rows = questions.slice(0, 5).map(q => new ActionRowBuilder().addComponents(q));
      rows.push(new ActionRowBuilder().addComponents(resumeInput));

      modal.addComponents(...rows);

      await interaction.showModal(modal);
      client.application.set('pendingStaffApp', user.id);

    } else {
      // 🎫 Create Ticket Channel
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

      // 📝 Ticket Embed
      const ticketEmbed = new EmbedBuilder()
        .setTitle(`${BRAND_EMOJIS[customId]} ${TICKET_TYPE_NAMES[customId] || 'Ticket'} Opened`)
        .setDescription('Please describe your request in detail. A team member will assist you shortly.')
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
      const logChannel = guild.channels.cache.get(TICKET_OPEN_LOG_ID);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('🎫 Ticket Opened')
          .setDescription(`**Type:** ${TICKET_TYPE_NAMES[customId]}\n**Channel:** ${ticketChannel}`)
          .addFields(
            { name: '👤 User', value: `<@${user.id}>`, inline: true },
            { name: '🆔 ID', value: `\`${user.id}\``, inline: true }
          )
          .setColor('#00FF00')
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }

      await interaction.editReply({
        content: `✅ Your ticket has been created: ${ticketChannel}`,
        ephemeral: true,
      });
    }
  } catch (err) {
    console.error(err);
    await interaction.editReply({ content: '❌ An error occurred.' });
  }
});

// 📝 Handle Apply Staff Modal
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit() || interaction.customId !== 'apply_staff_modal') return;

  const userId = interaction.user.id;
  if (client.application.get('pendingStaffApp') !== userId) return;

  await interaction.deferReply({ ephemeral: true });

  const responses = [];
  for (let i = 1; i <= 19; i++) {
    responses.push(`**Q${i}:** ${interaction.fields.getTextInputValue(`q${i}`)}`);
  }
  const resume = interaction.fields.getTextInputValue('resume');
  responses.push(`**Resume:** ${resume || 'Not provided'}`);

  const fullResponse = responses.join('\n');

  try {
    // 📩 Send to DM first
    const dm = await interaction.user.createDM();
    const dmEmbed = new EmbedBuilder()
      .setTitle('💼 Your Staff Application (Preview)')
      .setDescription(fullResponse)
      .setColor('#FFD700')
      .setFooter({ text: 'Regime Unit • Application submitted' })
      .setTimestamp();
    await dm.send({ embeds: [dmEmbed] });

    // 📥 Forward to staff channel
    const staffChannel = client.channels.cache.get(STAFF_APPLICATION_CHANNEL_ID);
    if (!staffChannel) {
      return interaction.editReply({ content: '❌ Staff channel not found.' });
    }

    const appEmbed = new EmbedBuilder()
      .setTitle('💼 New Staff Application')
      .setDescription(fullResponse)
      .addFields(
        { name: '👤 Applicant', value: `<@${userId}>`, inline: true },
        { name: '🆔 User ID', value: `\`${userId}\``, inline: true }
      )
      .setColor('#FF0000')
      .setTimestamp();

    const denyBtn = new ButtonBuilder()
      .setCustomId(`deny_staff_${userId}`)
      .setLabel('❌ Deny')
      .setStyle(ButtonStyle.Danger);

    const acceptMenu = new StringSelectMenuBuilder()
      .setCustomId(`accept_staff_${userId}`)
      .setPlaceholder('✅ Accept & Assign Role')
      .addOptions([
        { label: 'Moderator', value: 'moderator' },
        { label: 'Helper', value: 'helper' },
        { label: 'Manager', value: 'manager' },
        { label: 'Admin', value: 'admin' },
      ]);

    const actionRow1 = new ActionRowBuilder().addComponents(denyBtn);
    const actionRow2 = new ActionRowBuilder().addComponents(acceptMenu);

    await staffChannel.send({
      content: `<@&${SUPPORT_ROLE_ID}>`, // Ping staff
      embeds: [appEmbed],
      components: [actionRow1, actionRow2],
    });

    await interaction.editReply({ content: '✅ Your application has been submitted for review!' });
  } catch (err) {
    console.error(err);
    await interaction.editReply({ content: '❌ Failed to submit application.' });
  }
});

// 🛠️ Handle Close & Claim
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, channel, member, guild } = interaction;

  if (customId === 'close_ticket') {
    if (!channel.name.startsWith('ticket-')) {
      return interaction.reply({ content: '❌ This is not a ticket!', ephemeral: true });
    }

    const closerEmbed = new EmbedBuilder()
      .setTitle(`${BRAND_EMOJIS.close} Ticket Closing`)
      .setDescription('This ticket will be deleted in 5 seconds.')
      .setColor('#FF0000')
      .setTimestamp();

    await interaction.reply({ embeds: [closerEmbed] });

    // 📜 Log ticket close
    const logChannel = guild.channels.cache.get(TICKET_CLOSE_LOG_ID);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🗑️ Ticket Closed')
        .setDescription(`**Channel:** ${channel.name}\n**Closed by:** ${member}`)
        .addFields(
          { name: '📁 Category', value: channel.parent ? channel.parent.name : 'No Category', inline: true }
        )
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
      return interaction.reply({ content: '❌ You do not have permission to claim this ticket.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`${BRAND_EMOJIS.claim} Ticket Claimed`)
      .setDescription(`Claimed by ${member}`)
      .setColor('#00FF00');
    await interaction.reply({ embeds: [embed] });
  }
});

// ✅ Handle Accept/Deny Staff
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith('deny_staff_')) {
    const userId = interaction.customId.split('_')[2];
    const user = await client.users.fetch(userId).catch(() => null);

    const embed = new EmbedBuilder()
      .setTitle('❌ Application Denied')
      .setDescription(user ? `Application from ${user} has been denied.` : 'Application denied.')
      .setColor('#FF0000');
    await interaction.update({ embeds: [embed], components: [] });

    if (user) user.send('❌ Your staff application to **Regime Unit** has been denied.').catch(() => {});
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('accept_staff_')) {
    const userId = interaction.customId.split('_')[2];
    const values = interaction.values;
    const user = await client.users.fetch(userId).catch(() => null);
    const member = await guild.members.fetch(userId).catch(() => null);

    const roleMap = {
      moderator: 'MODERATOR_ROLE_ID', // ← Replace with real IDs
      helper: 'HELPER_ROLE_ID',
      manager: 'MANAGER_ROLE_ID',
      admin: 'ADMIN_ROLE_ID',
    };

    const assigned = [];
    if (member) {
      for (const val of values) {
        const roleId = roleMap[val];
        if (roleId) {
          await member.roles.add(roleId).catch(console.error);
          assigned.push(`<@&${roleId}>`);
        }
      }
    }

    const assignedList = assigned.length ? assigned.join(', ') : 'No roles assigned';

    const embed = new EmbedBuilder()
      .setTitle('✅ Application Accepted')
      .setDescription(`Accepted. Assigned: ${assignedList}`)
      .setColor('#00FF00');
    await interaction.update({ embeds: [embed], components: [] });

    if (user) {
      user.send(`🎉 Congratulations! Your application to **Regime Unit** has been accepted. You've been assigned: ${assignedList}`).catch(() => {});
    }
  }
});

client.login(process.env.TOKEN);

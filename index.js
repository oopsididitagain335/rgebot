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

// 🌐 Express Web Server (for hosting platforms)
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

// 🎟️ Handle Button Interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, guild, member } = interaction;

  // Handle Apply Staff — showModal() must be the FIRST response
  if (customId === TYPES.APPLY_STAFF) {
    try {
      const dmChannel = await user.createDM().catch(() => null);
      if (!dmChannel) {
        return await interaction.reply({
          content: '❌ I couldn’t send you a DM. Please enable DMs from server members.',
          ephemeral: true,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('apply_staff_modal')
        .setTitle('💼 Staff Application');

      // ✅ 20 Questions (19 short + 1 resume)
      const questions = [
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
      ];

      const rows = questions.map((q, i) =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`q${i + 1}`)
            .setLabel(`Q${i + 1}`)
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true)
            .setPlaceholder(q)
        )
      );

      // Resume field
      rows.push(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('resume')
            .setLabel('📄 Resume / Portfolio Link')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://drive.example.com/resume')
            .setRequired(false)
        )
      );

      modal.addComponents(...rows);

      // ✅ showModal() — must be first and only response
      await interaction.showModal(modal);

      // Store user ID
      client.application.set('pendingStaffApp', user.id);

    } catch (err) {
      console.error(err);
      await interaction.reply({
        content: '❌ An error occurred.',
        ephemeral: true,
      });
    }

    return; // Exit — showModal() sent
  }

  // Handle other ticket types
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
  } catch (err) {
    console.error(err);
    await interaction.editReply({ content: '❌ Failed to create ticket.' });
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
    const value = interaction.fields.getTextInputValue(`q${i}`);
    responses.push(`**Q${i}:** ${value}`);
  }
  const resume = interaction.fields.getTextInputValue('resume');
  responses.push(`**Resume:** ${resume || 'Not provided'}`);

  const fullResponse = responses.join('\n');

  try {
    // 📩 Send to user's DM
    const dm = await interaction.user.createDM();
    const dmEmbed = new EmbedBuilder()
      .setTitle('💼 Your Staff Application')
      .setDescription(fullResponse)
      .setColor('#FFD700')
      .setFooter({ text: 'Regime Unit • Submitted' })
      .setTimestamp();
    await dm.send({ embeds: [dmEmbed] });

    // 📥 Send to staff channel
    const staffChannel = client.channels.cache.get(STAFF_APPLICATION_CHANNEL_ID);
    if (!staffChannel) {
      return await interaction.editReply({ content: '❌ Staff channel not found.' });
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

    // ✅ Dynamically fetch roles (excluding @everyone and bots)
    const roles = guild.roles.cache
      .filter(r => r.id !== guild.id && !r.managed && r.editable && r.name.toLowerCase() !== 'bot')
      .sort((a, b) => b.position - a.position)
      .first(25); // Max 25 options

    if (roles.size === 0) {
      return await interaction.editReply({ content: '❌ No assignable roles found.' });
    }

    const roleOptions = roles.map(r => ({
      label: r.name,
      value: r.id,
    }));

    const roleMenu = new StringSelectMenuBuilder()
      .setCustomId(`accept_staff_${userId}`)
      .setPlaceholder('✅ Accept & Assign Role')
      .addOptions(roleOptions);

    const actionRow1 = new ActionRowBuilder().addComponents(denyBtn);
    const actionRow2 = new ActionRowBuilder().addComponents(roleMenu);

    await staffChannel.send({
      content: `<@&${SUPPORT_ROLE_ID}>`,
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
      return interaction.reply({ content: '❌ Not a ticket!', ephemeral: true });
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
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🔖 Ticket Claimed')
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
      .setDescription(user ? `Application from ${user} has been denied.` : 'Denied.')
      .setColor('#FF0000');
    await interaction.update({ embeds: [embed], components: [] });

    if (user) user.send('❌ Your application was denied.').catch(() => {});
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('accept_staff_')) {
    const userId = interaction.customId.split('_')[2];
    const selectedRoleIds = interaction.values;
    const user = await client.users.fetch(userId).catch(() => null);
    const member = await guild.members.fetch(userId).catch(() => null);

    const roleMentions = selectedRoleIds.map(id => `<@&${id}>`).join(', ');

    const embed = new EmbedBuilder()
      .setTitle('✅ Application Accepted')
      .setDescription(`Accepted. Assigned: ${roleMentions}`)
      .setColor('#00FF00');
    await interaction.update({ embeds: [embed], components: [] });

    if (member) {
      for (const roleId of selectedRoleIds) {
        await member.roles.add(roleId).catch(console.error);
      }
    }

    if (user) {
      user.send(`🎉 Congratulations! You've been accepted as staff and assigned: ${roleMentions}`).catch(() => {});
    }
  }
});

client.login(process.env.TOKEN);

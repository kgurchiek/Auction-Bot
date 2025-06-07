const { Client, Partials, Collection, Events, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(config.supabase.url, config.supabase.key);
let auctions = require('./auctions.json');
const { google } = require('googleapis');

(async () => {
    const auth = new google.auth.GoogleAuth({
        credentials: config.google.credentials,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.readonly'
        ],
    });
    let googleClient = await auth.getClient();
    let googleToken = await googleClient.getAccessToken();
    let googleSheets = google.sheets({ version: 'v4', auth: googleClient });

    let dkpSheet;
    const updateDKPSheet = async () => {
        let sheet = (await (await fetch(config.google.DKP.sheet, { headers: { Authorization: `Bearer ${googleToken.token}` }})).text()).split('\n').map(a => {
            a = a.trim();
            let row = [''];
            let state = 0;
            for (let i = 0; i < a.length; i++) {
                if (a[i] == '"') state++;
                if (a[i] == ',' && state % 2 == 0) row.push('');
                else if (a[i] != '"' || a[i + 1] == '"') row[row.length - 1] += a[i];
            }
            return row;
        });
        if (sheet[0][1] != 'Lifetime Points') return;
        dkpSheet = sheet.slice(1);
        for (const row of dkpSheet) {
            let { error } = await supabase.from('users').update({ dkp: row[2] }).eq('username', row[0]);
            if (error) {
                console.log('Error updating user:', error);
                continue;
            }
        }
    }
    updateDKPSheet();
    setInterval(updateDKPSheet, 1000 * 60 * 15);

    let pppSheet;
    const updatePPPSheet = async () => {
        let sheet = (await (await fetch(config.google.PPP.sheet, { headers: { Authorization: `Bearer ${googleToken.token}` }})).text()).split('\n').map(a => {
            a = a.trim();
            let row = [''];
            let state = 0;
            for (let i = 0; i < a.length; i++) {
                if (a[i] == '"') state++;
                if (a[i] == ',' && state % 2 == 0) row.push('');
                else if (a[i] != '"' || a[i + 1] == '"') row[row.length - 1] += a[i];
            }
            return row;
        });
        if (sheet[0][0] != 'Member') return;
        pppSheet = sheet.slice(1);
        for (const row of pppSheet) {
            let { error } = await supabase.from('users').update({ ppp: row[2] }).eq('username', row[0]);
            if (error) {
                console.log('Error updating user:', error);
                continue;
            }
        }
    }
    updatePPPSheet();
    setInterval(updatePPPSheet, 1000 * 60 * 15);

    let tallySheet;
    const updateTallySheet = async () => {
        let sheet = (await (await fetch(config.google.tallySheet, { headers: { Authorization: `Bearer ${googleToken.token}` }})).text()).split('\n').map(a => {
            a = a.trim();
            let row = [''];
            let state = 0;
            for (let i = 0; i < a.length; i++) {
                if (a[i] == '"') state++;
                if (a[i] == ',' && state % 2 == 0) row.push('');
                else if (a[i] != '"' || a[i + 1] == '"') row[row.length - 1] += a[i];
            }
            return row;
        });
        sheet.push(['Cornbread2100', '', 'FALSE']);
        if (sheet[0][0] != 'Notes') return;
        tallySheet = sheet.slice(7);
        for (const row of tallySheet) {
            let { error } = await supabase.from('users').update({ frozen: row[2].toLowerCase() == 'true' }).eq('username', row[0]);
            if (error) {
                console.log('Error updating user:', error);
                continue;
            }
        }
    }
    updateTallySheet();
    setInterval(updateTallySheet, 1000 * 60 * 15);

    let itemSheet;
    const updateItemSheet = () => {};
    updateItemSheet();
    setInterval(updateItemSheet, 1000 * 60 * 15);

    process.on('uncaughtException', console.error);

    const client = new Client({ partials: [Partials.Channel, Partials.GuildMember, Partials.Message], intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages] });
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        client.commands.set(command.data.name, command);
        console.log(`[Loaded]: ${file}`);
    }
    let guild;
    let dkpChannel;
    let pppChannel;
    client.once(Events.ClientReady, async () => {
        console.log(`[Bot]: ${client.user.tag}`);
        console.log(`[Servers]: ${client.guilds.cache.size}`);
        guild = await client.guilds.fetch(config.discord.server);
        dkpChannel = await client.channels.fetch(config.discord.dkpChannel);
        pppChannel = await client.channels.fetch(config.discord.pppChannel);

        for (const item in auctions) {
            if (auctions[item].DKP) {
                const dkpChannel = await client.channels.fetch(auctions[item].DKP.message.channelId);
                if (dkpChannel) {
                    try {
                        const message = await dkpChannel.messages.fetch(auctions[item].DKP.message.id);
                        auctions[item].DKP.message = message;
                    } catch (error) {
                        console.log(`Error fetching DKP message for ${item}:`, error);
                        auctions[item] = {};
                    }
                } else {
                    console.log(`DKP Channel not found for auction ${item}`);
                    auctions[item] == {};
                }
            }
            if (auctions[item].PPP) {
                const pppChannel = await client.channels.fetch(auctions[item].PPP.message.channelId);
                if (pppChannel) {
                    try {
                        const message = await pppChannel.messages.fetch(auctions[item].PPP.message.id);
                        auctions[item].PPP.message = message;
                    } catch (error) {
                        console.log(`Error fetching PPP message for ${item}:`, error);
                        auctions[item] = {};
                    }
                } else {
                    console.log(`PPP Channel not found for auction ${item}`);
                    auctions[item] = {};
                }
            }
        }
    });

    client.on(Events.InteractionCreate, async interaction => {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            
            let members = await guild.members.fetch();
            let guildMember = members.get(interaction.user.id);
            if (guildMember == null) {
                let errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .addFields({ name: 'Error', value: 'You must be a member of the server to use this bot.' });
                await interaction.reply({ embeds: [errorEmbed] });
                return;
            }
            
            let { data: user, error } = await supabase.from('users').select('id::text, username, dkp, ppp, frozen').eq('id', interaction.user.id).limit(1);
            if (error) {
                console.log(error);
                let errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .addFields({ name: 'Error', value: `Error fetching user data: ${error.message}` });
                await interaction.reply({ embeds: [errorEmbed] });
                return;
            }
            user = user[0];
            if (user == null && command.data.name != 'register') {
                let errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .addFields({ name: 'Error', value: 'User not found. Use /register to begin.' });
                await interaction.reply({ embeds: [errorEmbed] })
                return;
            }
            if (user != null) {
                user.staff = false;
                for (const role of config.discord.staffRoles) if (guildMember.roles.cache.get(role)) user.staff = true;
            }
            
            try {
                await command.execute(interaction, client, user, supabase, dkpSheet, pppSheet, tallySheet, auctions, dkpChannel, pppChannel, googleSheets);
            } catch (error) {
                console.log(error);
                var errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('Error Executing Command')
                    .setDescription(String(error.message))
                if (interaction.replied || interaction.deferred) await interaction.editReply({ embeds: [errorEmbed] })
                else await interaction.reply({ content: '', embeds: [errorEmbed] })
            }
        }
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet, auctions);
            } catch (error) {
                console.log(error);
                await interaction.respond([{ name: `[ERROR]: ${error.message}`.slice(0, 100), value: '​' }]);
            }
        }
        if (interaction.isButton()) {
            const command = client.commands.get(interaction.customId.split('-')[0]);
            if (command?.buttonHandler) command.buttonHandler(interaction);
        }
    });

    client.on(Events.MessageDelete, async message => {
        for (const item in auctions) {
            const auction = auctions[item];
            if (auction.DKP && auction.DKP?.message.guildId == message.guildId && auction.DKP?.message.channelId == message.channelId && auction.DKP?.message.id == message.id) auction.DKP.message = await dkpChannel.send({ embeds: [auction.DKP.embed] });
            if (auction.PPP && auction.PPP?.message.guildId == message.guildId && auction.PPP?.message.channelId == message.channelId && auction.PPP?.message.id == message.id) auction.PPP.message = await pppChannel.send({ embeds: [auction.PPP.embed] });
        }
    })

    client.login(config.discord.token);
})();
const { Client, Partials, Collection, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
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
    let googleSheets = google.sheets({ version: 'v4', auth: googleClient });

    let auctionSheet = {
        DKP: [],
        PPP: []
    }
    async function updateAuctionSheet() {
        if (config.google.DKP.log != '') {
            try {
                let sheet = (await googleSheets.spreadsheets.values.get({
                    spreadsheetId: config.google.DKP.id,
                    range: config.google.DKP.log
                })).data.values;
                if (sheet[0][0] == 'Member Name') auctionSheet.DKP = sheet;
            } catch (err) {
                console.log('Error fetching auctions:', err);
            }
        }

        if (config.google.PPP.log != '') {
            try {
                let sheet = (await googleSheets.spreadsheets.values.get({
                    spreadsheetId: config.google.PPP.id,
                    range: config.google.PPP.log
                })).data.values;
                if (sheet[0][0] == 'Member Name') auctionSheet.PPP = sheet;
            } catch (err) {
                console.log('Error fetching auctions:', err);
            }
        }
    }

    let dkpSheet;
    async function updateDKPSheet() {
        let sheet = (await googleSheets.spreadsheets.values.get({
            spreadsheetId: config.google.DKP.id,
            range: config.google.DKP.sheet
        })).data.values;
        if (sheet[0][1] != 'Lifetime Points') {
          console.log('Invalid dkp sheet:', sheet[0]);
          return;
        }
        dkpSheet = sheet.slice(1).filter(a => a[0] != '');

        dkpSheet.sort((a, b) => b[2] - a[2]);
        let messages = Array.from((await dkpLeaderboard.messages.fetch({ limit: 100, cache: false })).values()).filter(a => a.author.id == client.user.id).reverse();
        let embeds = [];
        let longestRank = Math.max(String(dkpSheet.length).length + 1, 'Live Rank'.length);
        let longestName = dkpSheet.reduce((a, b) => Math.max(a, b[0].split('(')[0].trim().length), 'Member'.length);
        let longestLifetime = dkpSheet.reduce((a, b) => Math.max(a, b[1].length), 'Lifetime'.length);
        let longestCurrent = dkpSheet.reduce((a, b) => Math.max(a, b[2].length), 'Current'.length);
        embeds.push(new EmbedBuilder().setColor('#00ff00').setTitle('Leaderboard').setDescription(`\`\`\`\nLive Rank${' '.repeat(longestRank - 'Live Rank'.length)} | Member${' '.repeat(longestName - 'Member'.length)} | Lifetime${' '.repeat(longestLifetime - 'Lifetime'.length)} | Current${''.repeat(longestCurrent - 'Current'.length)}\n`))
        dkpSheet.forEach((a, i) => {
            let rank = i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`;
            let string = `${rank}${' '.repeat(longestRank - rank.length)} | ${a[0].split('(')[0].trim()}${' '.repeat(longestName - a[0].split('(')[0].trim().length)} | ${a[1]}${' '.repeat(longestLifetime - a[1].length)} | ${a[2]}${''.repeat(longestCurrent - a[2].length)}\n`;
            if (embeds[embeds.length - 1].data.description.length + string.length > 4093) embeds.push(new EmbedBuilder().setColor('#00ff00').setDescription('```'));
            embeds[embeds.length - 1].data.description += string;
        })
        embeds.forEach((a, i) => {
            a.data.description += '```';
            if (messages[i]) messages[i].edit({ embeds: [a] });
            else dkpLeaderboard.send({ embeds: [a] });
        });
        for (let message of messages.slice(embeds.length)) await message.delete();

        for (const row of dkpSheet) {
            if (row[0] == '') continue;
            let cost = 0;
            for (let item of auctionSheet.DKP) if (item[0] == row[0] && item.length < 7) cost += parseFloat(item[3]);
            // console.log(row[0], cost, 'DKP');
            supabase.from(config.supabase.tables.users).update({ dkp: parseFloat(row[2]) - cost }).eq('username', row[0])
            .then(({ error }) => {
                if (error) console.log('Error updating dkp:', error.message);
            });
            await new Promise(res => setTimeout(res, 50));
        }
        console.log('Updated dkp sheet');
    }

    let pppSheet;
    async function updatePPPSheet() {
        let sheet = (await googleSheets.spreadsheets.values.get({
            spreadsheetId: config.google.PPP.id,
            range: config.google.PPP.sheet
        })).data.values;
        if (sheet[0][0] != 'Member') {
          console.log('Invalid ppp sheet:', sheet[0]);
          return;
        }
        pppSheet = sheet.slice(1).filter(a => a[0] != '');

        pppSheet.sort((a, b) => b[2] - a[2]);
        let messages = Array.from((await pppLeaderboard.messages.fetch({ limit: 100, cache: false })).values()).filter(a => a.author.id == client.user.id).reverse();
        let embeds = [];
        let longestRank = Math.max(String(pppSheet.length).length + 1, 'Live Rank'.length);
        let longestName = pppSheet.reduce((a, b) => Math.max(a, b[0].split('(')[0].trim().length), 'Member'.length);
        let longestLifetime = pppSheet.reduce((a, b) => Math.max(a, b[1].length), 'Lifetime'.length);
        let longestCurrent = pppSheet.reduce((a, b) => Math.max(a, b[2].length), 'Current'.length);
        embeds.push(new EmbedBuilder().setColor('#00ff00').setTitle('Leaderboard').setDescription(`\`\`\`\nLive Rank${' '.repeat(longestRank - 'Live Rank'.length)} | Member${' '.repeat(longestName - 'Member'.length)} | Lifetime${' '.repeat(longestLifetime - 'Lifetime'.length)} | Current${''.repeat(longestCurrent - 'Current'.length)}\n`))
        pppSheet.slice(0, 75).forEach((a, i) => {
            let rank = i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`;
            let string = `${rank}${' '.repeat(longestRank - rank.length)} | ${a[0].split('(')[0].trim()}${' '.repeat(longestName - a[0].split('(')[0].trim().length)} | ${a[1]}${' '.repeat(longestLifetime - a[1].length)} | ${a[2]}${''.repeat(longestCurrent - a[2].length)}\n`;
            if (embeds[embeds.length - 1].data.description.length + string.length > 4093) embeds.push(new EmbedBuilder().setColor('#00ff00').setDescription('```'));
            embeds[embeds.length - 1].data.description += string;
        })
        embeds.forEach((a, i) => {
            a.data.description += '```';
            if (messages[i]) messages[i].edit({ embeds: [a] });
            else pppLeaderboard.send({ embeds: [a] })
        });
        for (let message of messages.slice(embeds.length)) await message.delete();

        for (const row of pppSheet) {
            if (row[0] == '') continue;
            let cost = 0;
            for (let item of auctionSheet.PPP) if (item[0] == row[0] && item.length < 7) cost += parseFloat(item[3]);
            supabase.from(config.supabase.tables.users).update({ ppp: parseFloat(row[2]) - cost }).eq('username', row[0])
            .then(({ error }) => {
                if (error) console.log('Error updating ppp:', error.message);
            });
            await new Promise(res => setTimeout(res, 50));
        }
        console.log('Updated ppp sheet');
    }

    let tallySheet;
    async function updateTallySheet() {
        let sheet = (await googleSheets.spreadsheets.values.get({
            spreadsheetId: config.google.tally.id,
            range: config.google.tally.sheet
        })).data.values;
        if (sheet[0][0] != 'Notes') {
          console.log('Invalid tally sheet:', sheet[0]);
          return;
        }
        tallySheet = sheet.slice(7).filter(a => a[0] != '');
        for (const row of tallySheet) {
            if (row[0] == '') continue;
            supabase.from(config.supabase.tables.users).update({ frozen: row[2].toLowerCase() == 'true' }).eq('username', row[0])
            .then(({ error }) => {
                if (error) console.log('Error updating freeze:', error.message);
            })
            await new Promise(res => setTimeout(res, 50));
        }
        console.log('Updated tally sheet');
    }

    async function updateSheets() {
        await updateAuctionSheet();
        console.log('Updated auction sheets');
        await Promise.all([updateDKPSheet(), updatePPPSheet(), updateTallySheet()]);
        console.log('Updated sheets');
        setTimeout(updateSheets, 1000 * 10);
    }

    let itemList;
    async function updateItems () {
        let { data, error } = await supabase.from(config.supabase.tables.items).select('*').eq('available', true);
        if (error == null) itemList = data;
        else {
            // console.log('Error fetching item list:', error.message);
            await new Promise(res => setTimeout(res, 1000));
        }
        setTimeout(updateItems);
    }
    updateItems();

    let auctionList;
    async function updateAuctions() {
        let { data, error } = await supabase.from(config.supabase.tables.auctions).select('id::text, start, item (name, type, monster, available, wipe), bids, host, winner, price').eq('open', true);
        if (error == null) auctionList = data;
        else {
            // console.log('Error fetching auction list:', error.message);
            await new Promise(res => setTimeout(res, 1000));
        }
        setTimeout(updateAuctions);
    }
    updateAuctions();

    let userList;
    async function updateUsers() {
        let { data, error } = await supabase.from(config.supabase.tables.users).select('id::text, username, dkp, ppp, frozen');
        if (error == null) userList = data;
        else {
            // console.log('Error fetching user list:', error.message);
            await new Promise(res => setTimeout(res, 1000));
        }

        if (tallySheet != null && mismatchChannel != null) {
            let members = userList.filter(a => tallySheet.find(b => b[0] == a.username) == null).sort((a, b) => a.username > b.username ? 1 : -1);
            console.log(userList.length, members.length, members.map(a => a.username));
            let messages = Array.from((await mismatchChannel.messages.fetch({ limit: 100, cache: false })).values()).filter(a => a.author.id == client.user.id).reverse();
            let embeds = [];
            embeds.push(new EmbedBuilder().setColor('#00ff00').setTitle('Mismatched Users').setDescription('```\n'));
            members.forEach((member, i) => {
                let string = `${i + 1}${' '.repeat(String(members.length).length - String(i + 1).length)} | ${member.username}\n`;
                if (embeds[embeds.length - 1].data.description.length + string.length > 4093) embeds.push(new EmbedBuilder().setColor('#00ff00').setDescription('```'));
                embeds[embeds.length - 1].data.description += string;
            })
            embeds.forEach((a, i) => {
                a.data.description += '```';
                if (messages[i]) messages[i].edit({ embeds: [a] });
                else mismatchChannel.send({ embeds: [a] });
            });
            for (let message of messages.slice(embeds.length)) await message.delete();
        }

        setTimeout(updateUsers, 1000);
    }
    updateUsers();

    async function updateUnregistered() {
        if (unregisteredChannel == null) return;
        let members = Array.from((await guild.members.fetch()).values()).filter(a => !a.user.bot);
        members = members.map(a => new Promise(async res => res({ member: a, account: await supabase.from(config.supabase.tables.users).select('id::text').eq('id', a.id)})));
        members = (await Promise.all(members)).filter(a => a.account.data?.length == 0).map(a => a.member);
        members.sort((a, b) => a.user.username > b.user.username ? 1 : -1);

        let messages = Array.from((await unregisteredChannel.messages.fetch({ limit: 100, cache: false })).values()).filter(a => a.author.id == client.user.id).reverse();
        let embeds = [];
        embeds.push(new EmbedBuilder().setColor('#00ff00').setTitle('Unregistered Users').setDescription('```\n'));
        members.forEach((member, i) => {
            let string = `${i + 1}${' '.repeat(String(members.length).length - String(i + 1).length)} | ${member.user.username}\n`;
            if (embeds[embeds.length - 1].data.description.length + string.length > 4093) embeds.push(new EmbedBuilder().setColor('#00ff00').setDescription('```'));
            embeds[embeds.length - 1].data.description += string;
        })
        embeds.forEach((a, i) => {
            a.data.description += '```';
            if (messages[i]) messages[i].edit({ embeds: [a] });
            else unregisteredChannel.send({ embeds: [a] });
        });
        for (let message of messages.slice(embeds.length)) await message.delete();

        setTimeout(updateUnregistered, 1000 * 60 * 5);
    }

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
    let rollChannel;
    let dkpLeaderboard;
    let pppLeaderboard;
    let unregisteredChannel;
    let mismatchChannel;
    client.once(Events.ClientReady, async () => {
        console.log(`[Bot]: ${client.user.tag}`);
        console.log(`[Servers]: ${client.guilds.cache.size}`);
        guild = await client.guilds.fetch(config.discord.server);
        dkpChannel = await client.channels.fetch(config.discord.dkpChannel);
        pppChannel = await client.channels.fetch(config.discord.pppChannel);
        rollChannel = await client.channels.fetch(config.discord.rollChannel);
        dkpLeaderboard = await client.channels.fetch(config.discord.leaderboard.DKP);
        pppLeaderboard = await client.channels.fetch(config.discord.leaderboard.PPP);
        if (config.discord.unregistered != '') unregisteredChannel = await client.channels.fetch(config.discord.unregistered);
        if (config.discord.mismatch != '') mismatchChannel = await client.channels.fetch(config.discord.mismatch);

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

        updateSheets();
        updateUnregistered();
    });

    async function getUser(id) {
        let { data: user, error } = await supabase.from(config.supabase.tables.users).select('id::text, username, dkp, ppp, frozen').eq('id', id).limit(1);
        return error ? { error } : user[0];
    }

    client.on(Events.InteractionCreate, async interaction => {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await interaction.deferReply({ ephemeral: command.ephemeral });
            
            let members = await guild.members.fetch();
            let guildMember = members.get(interaction.user.id);
            if (guildMember == null) {
                let errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .addFields({ name: 'Error', value: 'You must be a member of the server to use this bot.' });
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
                return;
            }
            
            let user = await getUser(interaction.user.id);
            if (command.data.name != 'register') {
                if (user == null) {
                    let errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .addFields({ name: 'Error', value: 'User not found. Use /register to begin.' });
                    await interaction.editReply({ embeds: [errorEmbed], components: [] });
                    return;
                }
                if (user.error) {
                    console.log(error);
                    let errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .addFields({ name: 'Error', value: `Error fetching user data: ${error.message}` });
                    await interaction.editReply({ embeds: [errorEmbed], components: [] });
                    return;
                }
            }
            if (user != null) {
                user.staff = false;
                for (const role of config.discord.staffRoles) if (guildMember.roles.cache.get(role)) user.staff = true;
            }
            
            try {
                await command.execute(interaction, client, user, supabase, dkpSheet, pppSheet, tallySheet, auctions, dkpChannel, pppChannel, rollChannel, googleSheets, updateSheets, itemList, auctionSheet);
            } catch (error) {
                console.log(error);
                var errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('Error Executing Command')
                    .setDescription(String(error.message))
                try {
                    await interaction.editReply({ embeds: [errorEmbed], components: [] })
                } catch (e) {}
            }
        }
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.autocomplete(interaction, client, supabase, dkpSheet, pppSheet, tallySheet, auctions, itemList, auctionList, userList, auctionSheet);
            } catch (error) {
                console.log(error);
                try {
                    await interaction.respond([{ name: `[ERROR]: ${error.message}`.slice(0, 100), value: '​' }]);
                } catch (e) {}
            }
        }
        if (interaction.isButton()) {
            let user = await getUser(interaction.user.id);

            const command = client.commands.get(interaction.customId.split('-')[0]);
            if (command?.buttonHandler) command.buttonHandler(interaction, user, supabase, auctions, dkpChannel, pppChannel, rollChannel, googleSheets, itemList);
        }
        if (interaction.isAnySelectMenu()) {
            let user = await getUser(interaction.user.id);

            const command = client.commands.get(interaction.customId.split('-')[0]);
            if (command?.selectHandler) command.selectHandler(interaction, user);
        }
        if (interaction.isModalSubmit()) {
            const command = client.commands.get(interaction.customId.split('-')[0]);
            if (command == null) return;

            let user = await getUser(interaction.user.id);
            if (user.error) {
                console.log(error);
                let errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .addFields({ name: 'Error', value: `Error fetching user data: ${error.message}` });
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
                return;
            }

            if (command?.modalHandler) command.modalHandler(interaction, user, supabase, auctions);
        }
    });

    client.on(Events.MessageDelete, async message => {
        for (const item in auctions) {
            const auction = auctions[item];
            let foundDKP = false;
            let foundPPP = false;
            if (auction.DKP && auction.DKP?.message.guildId == message.guildId && auction.DKP?.message.channelId == message.channelId && auction.DKP?.message.id == message.id) foundDKP = true;
            if (auction.PPP && auction.PPP?.message.guildId == message.guildId && auction.PPP?.message.channelId == message.channelId && auction.PPP?.message.id == message.id) foundPPP = true;
            if (!(foundDKP || foundPPP)) continue;
            if (auctionList.find(a => a.item.name == item) || auctionList.find(a => a.item.monster == item)) {
                if (foundDKP) auction.DKP.message = await dkpChannel.send({ embeds: [auction.DKP.embed], components: auction.DKP.buttons });
                if (foundPPP) auction.PPP.message = await pppChannel.send({ embeds: [auction.PPP.embed], components: auction.PPP.buttons });
            } else delete auctions[item];
        }
        try {
            fs.writeFileSync('./auctions.json', JSON.stringify(auctions, '', '  '));
        } catch (err) {
            console.log('Error saving auctions:', err);
        }
    })

    client.login(config.discord.token);
})();
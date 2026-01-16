const { Client, Partials, Collection, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(config.supabase.url, config.supabase.key);
let auctions = require('./auctions.json');

(async () => {
    let itemList;
    async function updateItems() {
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
        let { data, error } = await supabase.from(config.supabase.tables.users).select('*');
        if (error == null) {
            userList = data;
            console.log(`[User List]: Fetched ${userList.length} users.`);

            for (let type of ['DKP', 'PPP']) {
                let messages = Array.from((await leaderboards[type].messages.fetch({ limit: 100, cache: false })).values()).filter(a => a.author.id == client.user.id).reverse();
                let embeds = [];
                let longestRank = Math.max(String(userList.length).length + 1, 'Live Rank'.length);
                let longestName = userList.reduce((a, b) => Math.max(a, b.username.split('(')[0].trim().length), 'Member'.length);
                let longestLifetime = userList.reduce((a, b) => Math.max(a, b[type == 'DKP' ? 'lifetime_dkp' : 'lifetime_ppp'].length), 'Lifetime'.length);
                let longestCurrent = userList.reduce((a, b) => Math.max(a, b[type.toLowerCase()].length), 'Current'.length);
                embeds.push(new EmbedBuilder().setColor('#00ff00').setTitle('Leaderboard').setDescription(`\`\`\`\nLive Rank${' '.repeat(longestRank - 'Live Rank'.length)} | Member${' '.repeat(longestName - 'Member'.length)} | Lifetime${' '.repeat(longestLifetime - 'Lifetime'.length)} | Current${''.repeat(longestCurrent - 'Current'.length)}\n`))
                userList.forEach((a, i) => {
                    let rank = i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`;
                    let lifetime = a[type == 'DKP' ? 'lifetime_dkp' : 'lifetime_ppp'];
                    let points = a[type.toLowerCase()];
                    let string = `${rank}${' '.repeat(longestRank - rank.length)} | ${a.username.split('(')[0].trim()}${' '.repeat(longestName - a.username.split('(')[0].trim().length)} | ${lifetime}${' '.repeat(longestLifetime - lifetime.length)} | ${points}${''.repeat(longestCurrent - points.length)}\n`;
                    if (embeds[embeds.length - 1].data.description.length + string.length > 4093) embeds.push(new EmbedBuilder().setColor('#00ff00').setDescription('```'));
                    embeds[embeds.length - 1].data.description += string;
                })
                embeds.forEach((a, i) => {
                    a.data.description += '```';
                    if (messages[i]) messages[i].edit({ embeds: [a] });
                    else leaderboards[type].send({ embeds: [a] });
                });
                for (let message of messages.slice(embeds.length)) await message.delete();
            }
        }
        else {
            // console.log('Error fetching user list:', error.message);
            await new Promise(res => setTimeout(res, 1000));
        }

        setTimeout(updateUsers, 2000);
    }

    async function updateUnregistered() {
        if (unregisteredChannel == null) return;
        let members = Array.from((await guild.members.fetch()).values()).filter(a => !a.user.bot && !a.roles.cache.get(config.discord.inactiveRole));
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

        console.log(`[Unregistered List]: Found ${members.length} unregistered users.`)

        setTimeout(updateUnregistered, 1000 * 60 * 5);
    }

    async function updateLootHistory() {
        let error;
        let dkpHistory;
        ({ data: dkpHistory, error } = await supabase.from(config.supabase.tables.DKP.lootHistory).select('*'));
        if (error) return console.log('Error fetching dkp loot history:', error.message);

        let pppHistory;
        ({ data: pppHistory, error } = await supabase.from(config.supabase.tables.PPP.lootHistory).select('*'));
        if (error) return console.log('Error fetching ppp loot history:', error.message);

        let dkpItems;
        ({ data: dkpItems, error } = await supabase.from(config.supabase.tables.DKP.ownedItems).select('*'));
        if (error) return console.log('Error fetching owned dkp items:', error.message);

        let pppItems;
        ({ data: pppItems, error } = await supabase.from(config.supabase.tables.PPP.ownedItems).select('*'));
        if (error) return console.log('Error fetching owned ppp items:', error.message);

        for (let item of dkpHistory.filter((a, i) => dkpHistory.slice(0, i).find(b => b.user == a.user) == null)) {
            let row = dkpItems.find(a => a.username == item.user);
            if (row == null) ({ error } = await supabase.from(config.supabase.tables.DKP.ownedItems).insert({ username: item.user, items: dkpHistory.filter(a => a.user == item.user).map(a => a.item) }));
            else ({ error } = await supabase.from(config.supabase.tables.DKP.ownedItems).update({ items: dkpHistory.filter(a => a.user == item.user).map(a => a.item) }).eq('username', item.user));
            if (error) console.log('Error updating owned dkp items:', error.message);
        }
        for (let item of pppHistory.filter((a, i) => pppHistory.slice(0, i).find(b => b.user == a.user) == null)) {
            let row = pppItems.find(a => a.username == item.user);
            if (row == null) ({ error } = await supabase.from(config.supabase.tables.PPP.ownedItems).insert({ username: item.user, items: pppHistory.filter(a => a.user == item.user).map(a => a.item) }));
            else ({ error } = await supabase.from(config.supabase.tables.PPP.ownedItems).update({ items: pppHistory.filter(a => a.user == item.user).map(a => a.item) }).eq('username', item.user));
            if (error) console.log('Error updating owned ppp items:', error.message);
        }
        setTimeout(updateAuctions);
    }
    updateLootHistory();

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
    let unregisteredChannel;
    let leaderboards;
    client.once(Events.ClientReady, async () => {
        console.log(`[Bot]: ${client.user.tag}`);
        console.log(`[Servers]: ${client.guilds.cache.size}`);
        guild = await client.guilds.fetch(config.discord.server);
        dkpChannel = await client.channels.fetch(config.discord.dkpChannel);
        pppChannel = await client.channels.fetch(config.discord.pppChannel);
        rollChannel = await client.channels.fetch(config.discord.rollChannel);
        if (config.discord.unregistered != '') unregisteredChannel = await client.channels.fetch(config.discord.unregistered);
        leaderboards = {
            DKP: await client.channels.fetch(config.discord.leaderboard.DKP),
            PPP: await client.channels.fetch(config.discord.leaderboard.PPP)
        }

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

        
        await updateUsers();
        await updateUnregistered();
    });

    async function getUser(id) {
        let { data: user, error } = await supabase.from(config.supabase.tables.users).select('id::text, username, dkp, ppp, frozen').eq('id', id).limit(1);
        return error ? { error } : user[0];
    }

    client.on(Events.InteractionCreate, async interaction => {
        let user = await getUser(interaction.user.id);
        if (!(interaction.isAutocomplete() || interaction.commandName == 'register')) {
            if (user == null) {
                let errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .addFields({ name: 'Error', value: 'User not found. Use /register to begin.' });
                await interaction.reply({ embeds: [errorEmbed], components: [], ephemeral: true });
                return;
            }
            if (user.error) {
                console.log(error);
                let errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .addFields({ name: 'Error', value: `Error fetching user data: ${error.message}` });
                await interaction.editReply({ embeds: [errorEmbed], components: [], ephemeral: true });
                return;
            }
        }

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await interaction.deferReply({ ephemeral: command.ephemeral });
            
            let guildMember = await guild.members.fetch(interaction.user.id);
            if (guildMember == null) {
                let errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .addFields({ name: 'Error', value: 'You must be a member of the server to use this bot.' });
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
                return;
            }
            
            if (user != null) {
                user.staff = false;
                for (const role of config.discord.staffRoles) if (guildMember.roles.cache.get(role)) user.staff = true;
            }
            
            try {
                await command.execute(interaction, client, user, supabase, auctions, dkpChannel, pppChannel, rollChannel, itemList);
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
                await command.autocomplete(interaction, client, supabase, auctions, itemList, auctionList, userList);
            } catch (error) {
                console.log(error);
                try {
                    await interaction.respond([{ name: `[ERROR]: ${error.message}`.slice(0, 100), value: '​' }]);
                } catch (e) {}
            }
        }
        if (interaction.isButton()) {
            const command = client.commands.get(interaction.customId.split('-')[0]);
            try {
                if (command?.buttonHandler) command.buttonHandler(interaction, user, supabase, auctions, dkpChannel, pppChannel, rollChannel, itemList, client);
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
        if (interaction.isAnySelectMenu()) {
            const command = client.commands.get(interaction.customId.split('-')[0]);
            try {
                if (command?.selectHandler) command.selectHandler(interaction, user, auctions);
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
        if (interaction.isModalSubmit()) {
            const command = client.commands.get(interaction.customId.split('-')[0]);
            if (command == null) {
                console.log(`Unknown command "${interaction.customId.split('-')[0]}"`);
                return;
            }
            try {
                if (command?.modalHandler) command.modalHandler(interaction, user, supabase, auctions);
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
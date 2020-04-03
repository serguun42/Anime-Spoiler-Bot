const
	fs = require("fs"),
	Telegraf = require("telegraf"),
	Sessions = require("telegraf/session"),
	Telegram = require("telegraf/telegram"),
	Markup = require("telegraf/markup"),
	DEV = require("os").platform() === "win32" || process.argv[2] === "DEV",
	CONFIG = JSON.parse(fs.readFileSync("./animespoilerbot.config.json")),
	TELEGRAM_BOT_TOKEN = CONFIG.TELEGRAM_BOT_TOKEN,
	ADMIN_TELEGRAM_DATA = CONFIG.ADMIN_TELEGRAM_DATA,
	CHATS_LIST = CONFIG.CHATS_LIST,
	COMMANDS = {
		"help": `Напиши мне через инлайн <code>@animespoilerbot &lt;ТЕКСТ СПОЙЛЕРА&gt;</code>. И я скрою всё сам и сделаю кнопочку.

Также ты можешь:
• написать команду <code>/spoiler</code> в реплае к тексту или картинке. Я скрою их.
• написать команду <code>/spoiler</code> в описании к картинку при её отправке. Я скрою её. После команды можешь указать описание, и оно будет видно при отправке через ЛС бота.
• написать команду <code>/spoiler</code>, а после неё текст спойлера. Я скрою его.

Чтобы я показал тебе скрытую картинку, <a href="https://t.me/animespoilerbot">начни со мной диалог</a>.`,
		"testcommand": `<pre>Ну и што ты здесь зобылб?</pre>`
	};


let telegramConnectionData = {}

if (DEV) {
	const ProxyAgent = require("proxy-agent");

	telegramConnectionData["agent"] = new ProxyAgent(CONFIG.PROXY_URL);
};


const
	telegram = new Telegram(TELEGRAM_BOT_TOKEN, telegramConnectionData),
	TOB = new Telegraf(TELEGRAM_BOT_TOKEN, { telegram: telegramConnectionData });


/**
 * @typedef {Object} TelegramFromObject
 * @property {Number} id
 * @property {String} first_name
 * @property {String} username
 * @property {Boolean} is_bot
 * @property {String} language_code
 * 
 * @typedef {Object} TelegramChatObject
 * @property {Number} id
 * @property {String} title
 * @property {String} type
 * 
 * @typedef {Object} TelegramPhotoObj
 * @property {String} file_id
 * @property {String} file_unique_id
 * @property {Number} file_size
 * @property {Number} width
 * @property {Number} height
 * 
 * @typedef {Object} TelegramMessageObject
 * @property {Number} message_id
 * @property {String} text
 * @property {TelegramFromObject} from
 * @property {TelegramChatObject} chat
 * @property {Number} date
 * @property {TelegramPhotoObj[]} [photo]
 * @property {TelegramMessageObject} [reply_to_message]
 * @property {String} [caption]
 * 
 * @typedef {Object} TelegramContext
 * @property {Object} telegram 
 * @property {String} updateType 
 * @property {Object} [updateSubTypes] 
 * @property {TelegramMessageObject} [message] 
 * @property {Object} [editedMessage] 
 * @property {Object} [inlineQuery] 
 * @property {Object} [chosenInlineResult] 
 * @property {Object} [callbackQuery] 
 * @property {Object} [shippingQuery] 
 * @property {Object} [preCheckoutQuery] 
 * @property {Object} [channelPost] 
 * @property {Object} [editedChannelPost] 
 * @property {Object} [poll] 
 * @property {Object} [pollAnswer] 
 * @property {TelegramChatObject} [chat] 
 * @property {TelegramFromObject} [from] 
 * @property {Object} [match] 
 * @property {Boolean} webhookReply
 */
/**
 * @param {TelegramContext} ctx 
 */
const DefaultHandler = (ctx) => {
	const {chat, from} = ctx;



	if ((chat && chat["type"] === "private")) {
		L(ctx, chat, from);
	};


	if (
		(chat && chat["type"] === "private") &&
		(from && from["id"] === ADMIN_TELEGRAM_DATA.id && from["username"] === ADMIN_TELEGRAM_DATA.username)
	) {
		return ctx.reply("```\n" + JSON.stringify({
			status: "Everything is OK",
			message: "You're ADMIN, writing in private",
			from, chat
		}, false, "    ") + "\n```", {
			parse_mode: "MarkdownV2"
		});
	};



	CHATS_LIST.forEach((chatFromList) => {
		if (!chatFromList.enabled) return false;
		if (chatFromList.id !== chat["id"]) return false;

		const message = ctx["message"];
		if (!message) return false;

		const text = message["text"];
		if (!text) return false;



		if (/^\/spoiler(\@animespoilerbot)?\b/i.test(text))
			return ReplySpoiler(ctx);


		let commandMatch = text.match(/^\/([\w]+)\@animespoilerbot$/i);

		if (commandMatch && commandMatch[1])
			return ctx.reply(COMMANDS[commandMatch[1]], {
				disable_web_page_preview: true,
				parse_mode: "HTML"
			}).then(L).catch(L);
	});
};

TOB.use(Sessions());
TOB.on("text", DefaultHandler);
TOB.on("photo", /** @param {TelegramContext} ctx */ (ctx) => {
	const {message} = ctx;

	if (message.caption && message.photo) {
		if (/^\/spoiler(\@animespoilerbot)?/.test(message.caption)) {
			L("There is a photo with spoiler-command caption!");


			let captionToHide = message.caption.match(/^\/spoiler(\@animespoilerbot)?\s(.+)/);

			if (captionToHide && captionToHide[2])
				captionToHide = captionToHide[2];
			else
				captionToHide = null;




			let bestPhoto = message.photo.pop()["file_id"];

			if (!bestPhoto) return L("No file_id in PhotoSize type's object");

			ctx.reply(`Спойлер отправил – ${GetUsername(message)}`, {
				disable_web_page_preview: true,
				parse_mode: "HTML",
				reply_markup: Markup.inlineKeyboard([
					Markup.callbackButton("🖼 Показать скрытую картинку 🖼", `SHOW_IMAGE_SPOILER_${GlobalGetIDForImage(bestPhoto, captionToHide)}`),
					Markup.urlButton("Проверить диалог", "https://t.me/animespoilerbot")
				])
			})
				.then(() => telegram.deleteMessage(message.chat.id, message.message_id))
				.then(L).catch(L);
		};
	};
});
TOB.launch();



const L = function(arg) {
	if (DEV) {
		console.log(...arguments);
		if (typeof arg == "object") fs.writeFileSync("./out/errors.json", JSON.stringify(arg, false, "\t"));
	};
};

const TGE = iStr => {
	if (!iStr) return "";
	
	if (typeof iStr === "string")
		return iStr
			.replace(/\&/g, "&amp;")
			.replace(/\</g, "&lt;")
			.replace(/\>/g, "&gt;");
	else
		return TGE(iStr.toString());
};


/**
 * @param {String} message
 */
const TelegramSendToAdmin = (message) => {
	if (!message) return;

	telegram.sendMessage(ADMIN_TELEGRAM_DATA.id, message, {
		parse_mode: "HTML",
		disable_notification: false
	}).then(() => {}, (e) => console.error(e));
};

TelegramSendToAdmin(`Anime Spoiler Bot have been spawned at ${new Date().toISOString()} <i>(ISO 8601, UTC)</i>`);



let spoilerIdStamp = new Number();

/** @type {Array.<{id: number, text: string}>} */
let textSpoilersArray = new Array();

/** @type {Array.<{id: number, file_id: string, caption?: string}>} */
let imageSpoilersArray = new Array();



/**
 * @param {String} iSpoiler
 * @returns {Number}
 */
const GlobalGetIDForText = (iSpoiler) => {
	let id = ++spoilerIdStamp + "_" + Date.now();

	textSpoilersArray.push({ id, text: iSpoiler });

	return id;
};

/**
 * @param {String} iFileIDSpoiler
 * @param {String} [iCaption]
 * @returns {Number}
 */
const GlobalGetIDForImage = (iFileIDSpoiler, iCaption) => {
	let id = ++spoilerIdStamp + "_" + Date.now();

	if (typeof iCaption == "string")
		imageSpoilersArray.push({ id, file_id: iFileIDSpoiler, caption: iCaption });
	else
		imageSpoilersArray.push({ id, file_id: iFileIDSpoiler });

	return id;
};

/**
 * @param {TelegramMessageObject} message
 */
const GetUsername = (message) => {
	const {from} = message;
	if (!from) return "<А Телеграм поломався)))>"

	if (from.username)
		return `<a href="https://t.me/${from.username}">${TGE(from.first_name)}${from.last_name ? " " + TGE(from.last_name) : ""}</a>`;
	else if (from.last_name)
		return TGE(from.first_name + " " + from.last_name);
	else
		return TGE(from.first_name);
};





TOB.on("inline_query", ({ inlineQuery, answerInlineQuery }) => {
	let spoilering = inlineQuery.query;
	if (!spoilering) {
		return answerInlineQuery([{
			type: "article",
			id: `spoiler_empty`,
			title: "Пожалуйста, наберите что-нибудь",
			description: "█████████ ████████ █████",
			thumb_url: CONFIG.EMPTY_QUERY_IMG,
			input_message_content: {
				message_text: "<Я дурачок и не набрал текст>"
			}
		}]).then(L).catch(L);
	};

	let remarked = spoilering.replace(/([^\s!?\.])/g, "█");

	answerInlineQuery([{
		type: "article",
		id: `spoiler_${inlineQuery.from.usernname || inlineQuery.from.id}_${Date.now()}`,
		title: "Отправить скрытый текст",
		thumb_url: CONFIG.EMPTY_QUERY_IMG,
		description: remarked,
		input_message_content: {
			message_text: remarked.slice(0, 20)
		},
		reply_markup: Markup.inlineKeyboard([
			Markup.callbackButton("📝 Показать скрытый спойлер 📝", `SHOW_TEXT_SPOILER_${GlobalGetIDForText(spoilering)}`)
		])
	}]).then(L).catch(L);
});

TOB.action(/^SHOW_TEXT_SPOILER_(\d+_\d+)/, (ctx) => {
	L(ctx.match);
	if (ctx.match && ctx.match[1]) {
		let indexOfSpoiler = textSpoilersArray.findIndex((spoiler) => spoiler.id === ctx.match[1]);

		if (indexOfSpoiler > -1) {
			let spoilerToDisplay = textSpoilersArray[indexOfSpoiler]["text"].toString();

			return ctx.answerCbQuery(spoilerToDisplay, true);
		} else
			return ctx.answerCbQuery("Спойлер настолько ужасный, что я его потерял 😬. Вот растяпа!", true);
	} else
		return ctx.answerCbQuery("Спойлер настолько ужасный, что я его потерял 😬. Вот растяпа!", true);
});

TOB.action(/^SHOW_IMAGE_SPOILER_([\w\d_]+)/, (ctx) => {
	const {from} = ctx;

	
	if (ctx.match && ctx.match[1]) {
		let indexOfSpoiler = imageSpoilersArray.findIndex((spoiler) => spoiler.id === ctx.match[1]);

		if (indexOfSpoiler > -1) {
			let photoToSend = imageSpoilersArray[indexOfSpoiler];

			if (typeof photoToSend.caption == "string")
				return telegram.sendPhoto(
						from.id,
						photoToSend.file_id.toString(),
						{ caption: photoToSend.caption }
					)
					.then(() => ctx.answerCbQuery("Отправил тебе в ЛС!"))
					.then(L).catch(L);
			else
				return telegram.sendPhoto(from.id, photoToSend.file_id.toString())
					.then(() => ctx.answerCbQuery("Отправил тебе в ЛС!"))
					.then(L).catch(L);
		} else
			return ctx.answerCbQuery("Картинка настолько ужасная, что я её потерял 😬. Вот растяпа!", true);
	} else
		return ctx.answerCbQuery("Картинка настолько ужасная, что я её потерял 😬. Вот растяпа!", true);
});


/**
 * @param {TelegramContext} ctx
 */
const ReplySpoiler = (ctx) => {
	const {message} = ctx;
	const replyingMessage = message["reply_to_message"];

	if (replyingMessage) {
		if (replyingMessage["photo"]) {
			const spoilerPhoto = replyingMessage["photo"];

			if (!(spoilerPhoto instanceof Array)) return L("Spoiler photo is not an array");

			let bestPhoto = spoilerPhoto.pop()["file_id"];

			if (!bestPhoto) return L("No file_id in PhotoSize type's object");

			ctx.reply(`Спойлер отправил – ${GetUsername(replyingMessage)}, сообщил – ${GetUsername(message)}`, {
				disable_web_page_preview: true,
				parse_mode: "HTML",
				reply_markup: Markup.inlineKeyboard([
					Markup.callbackButton("🖼 Показать скрытую картинку 🖼", `SHOW_IMAGE_SPOILER_${GlobalGetIDForImage(bestPhoto, replyingMessage.caption)}`),
					Markup.urlButton("Проверить диалог", "https://t.me/animespoilerbot")
				])
			})
				.then(() => telegram.deleteMessage(replyingMessage.chat.id, replyingMessage.message_id))
				.then(() => telegram.deleteMessage(message.chat.id, message.message_id))
				.then(L).catch(L);
		} else if (replyingMessage["text"]) {
			const spoilerText = replyingMessage["text"];

			let remarked = spoilerText.replace(/([^\s!?\.])/g, "█");

			ctx.reply(`${remarked.slice(0, 20)}\n\nСпойлер отправил – ${GetUsername(replyingMessage)}, сообщил – ${GetUsername(message)}`, {
				disable_web_page_preview: true,
				parse_mode: "HTML",
				reply_markup: Markup.inlineKeyboard([
					Markup.callbackButton("📝 Показать скрытый спойлер 📝", `SHOW_TEXT_SPOILER_${GlobalGetIDForText(spoilerText)}`)
				])
			})
				.then(() => telegram.deleteMessage(replyingMessage.chat.id, replyingMessage.message_id))
				.then(() => telegram.deleteMessage(message.chat.id, message.message_id))
				.then(L).catch(L);
		};
	} else if (message.text) {
		const spoilerText = message.text.replace(/^\/spoiler(\@animespoilerbot)?\s/, "");
		
		let remarked = spoilerText.replace(/([^\s!?\.])/g, "█");

		ctx.reply(`${remarked.slice(0, 20)}\n\nСпойлер отправил – ${GetUsername(message)}`, {
			disable_web_page_preview: true,
			parse_mode: "HTML",
			reply_markup: Markup.inlineKeyboard([
				Markup.callbackButton("📝 Показать скрытый спойлер 📝", `SHOW_TEXT_SPOILER_${GlobalGetIDForText(spoilerText)}`)
			])
		})
			.then(() => telegram.deleteMessage(message.chat.id, message.message_id))
			.then(L).catch(L);
	};
};
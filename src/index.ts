/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

type Author = {
	name: string,
	url?: string,
	icon_url?: string,
}

type Field = {
	name: string,
	value: string,
	inline?: boolean
}

type Image = {
	url: string,
}

type Embed = {
	title: string,
	description: string,
	url?: string,
	author: Author,
	color: number,
	fields?: Field[],
	image?: Image,
}

type Message = {
	embeds?: Embed[]
	content?: string
}

type Event = {
	id: number,
	name: string,
	location: string,
	mazemapLink: string,
	summary: string,
	description: string,
	slides: string,
	organizer: string,
	difficulty: string,
	image: string,
	unixStartTime: number,
	unixEndTime: number,
	hidden: boolean,
}

export interface Env {
	DISCORD_ID: string,
	DISCORD_TOKEN: string,
}

const PREFIXES = [
	'@everyone\nMark these events down in your schedule for the upcoming week:',
	"@everyone, we've got some awesome events planned in the next week!"
]

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (request.headers.get('X-Clippy') !== 'true') {
			throw new Error('Missing header')
		}
		const res = await publishEvents(env)
		return new Response(JSON.stringify(res) || 'ok')
	},

	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		await publishEvents(env)
	},
};

async function publishEvents(env: Env) {
	const events = await getEvents()
	const embeds = events.map(formatEvent)
	const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)]
	return await postEmbeds(env, { embeds, content: prefix }).then(res => res.map(r => r.json()))
}

async function getEvents(): Promise<Event[]> {
	const events: Event[] = await fetch('https://compsoc.io/api/events/all')
		.then(res => res.json())
	const thresholdStamp = new Date().getTime() / 1000 + 7 * 24 * 60 * 60
	return events.filter((event: Event) => event.unixStartTime < thresholdStamp && !event.hidden)
}

function formatEvent(event: Event): Embed {
	let description = `:calendar_spiral: ${unixAnySpan(event.unixStartTime, event.unixEndTime)}\n`
	description += `:map: ${event.location}`
	if (event.mazemapLink)
		description += ` [Mazemap](${event.mazemapLink})`
	description += '\n\n'
	description += `${event.summary}\n\n${event.description}`
	return {
		title: event.name,
		url: `https://compsoc.io/events/${event.id}`,
		description,
		author: {
			name: event.organizer,
		},
		color: 0xd14537,
		image: event.image ? { url: event.image } : undefined,
	}
}

async function postEmbeds(env: Env, { embeds, content }: { embeds: Embed[], content?: string }): Promise<any[]> {
	if (embeds.length == 0)
		return []
	if (embeds.length > 10) {
		const res = await postEmbeds(env, { embeds: embeds.slice(0, 10), content })
		res.push(...await postEmbeds(env, { embeds: embeds.slice(10) }))
		return res
	}
	return [await post(env, { embeds, content })]
}

async function post(env: Env, message: Message) {
	return await fetch(
		`https://discord.com/api/webhooks/${env.DISCORD_ID}/${env.DISCORD_TOKEN}`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(message),
		}
	)
}



function unixToDate(date: number): Date {
	return new Date(date * 1000);
}

function fullDate(date: Date) {
	return date.toLocaleString("en-GB", {
		timeZone: "utc",
		weekday: "long",
		day: "numeric",
		month: "long",
		hour: "numeric",
		minute: "numeric",
		hour12: false,
	});
}

function justTime(date: Date) {
	return date.toLocaleString("en-GB", {
		timeZone: "utc",
		hour: "numeric",
		minute: "numeric",
		hour12: false,
	});
}

function unixToTimespan(start: number, end: number) {
	const startDate = unixToDate(start);
	const endDate = unixToDate(end);
	return `${fullDate(startDate)} to ${justTime(endDate)}`;
}

function unixToDatespan(start: number, end: number) {
	const startDate = unixToDate(start);
	const endDate = unixToDate(end);
	return `${fullDate(startDate)} to ${fullDate(endDate)}`;
}

function unixAnySpan(start: number, end: number) {
	const startDate = unixToDate(start).toDateString();
	const endDate = unixToDate(end).toDateString();
	if (startDate === endDate) {
		return unixToTimespan(start, end);
	} else {
		return unixToDatespan(start, end);
	}
}

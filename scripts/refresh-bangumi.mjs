import { readFile, writeFile } from "node:fs/promises";
import yaml from "js-yaml";

const API_BASE = "https://api.bgm.tv";
const CACHE_FILE = new URL("../src/data/anime.json", import.meta.url);
const CONFIG_FILE = new URL("../twilight.config.yaml", import.meta.url);
const REQUEST_TIMEOUT_MS = 15_000;
const CONCURRENCY = 5;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readCache() {
    try {
        return JSON.parse(await readFile(CACHE_FILE, "utf8"));
    } catch {
        return { updatedAt: null, anime: [] };
    }
}

async function requestJson(path) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const response = await fetch(`${API_BASE}${path}`, {
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                headers: { Accept: "application/json", "User-Agent": "Twilight-static-site/1.0" },
            });
            if (!response.ok) throw new Error(`Bangumi API returned HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            lastError = error;
            if (attempt < 3) await sleep(attempt * 1_000);
        }
    }
    throw lastError;
}

async function collection(userId, type) {
    const items = [];
    const limit = 50;
    for (let offset = 0; ; offset += limit) {
        const page = await requestJson(`/v0/users/${encodeURIComponent(userId)}/collections?subject_type=2&type=${type}&limit=${limit}&offset=${offset}`);
        const data = Array.isArray(page.data) ? page.data : [];
        items.push(...data);
        if (data.length < limit) return items;
    }
}

async function mapWithConcurrency(items, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function worker() {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await mapper(items[index]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
    return results;
}

async function getStudio(subjectId) {
    try {
        const people = await requestJson(`/v0/subjects/${subjectId}/persons`);
        const studio = Array.isArray(people)
            ? people.find((person) => ["动画制作", "製作", "制作"].includes(person.relation))
            : undefined;
        return studio?.name ?? "Unknown";
    } catch (error) {
        console.warn(`Could not get studio for subject ${subjectId}: ${error.message}`);
        return "Unknown";
    }
}

async function toAnime(item, status) {
    const subject = item.subject ?? {};
    const progress = item.ep_status ?? 0;
    const totalEpisodes = subject.eps || progress;
    return {
        title: subject.name_cn || subject.name || "Unknown Title",
        status,
        rating: item.rate ? Number(Number(item.rate).toFixed(1)) : 0,
        cover: subject.images?.medium || "/assets/anime/default.webp",
        description: (subject.short_summary || subject.name_cn || "").trimStart(),
        year: subject.date || "Unknown",
        genre: subject.tags?.slice(0, 3).map((tag) => tag.name) || ["Unknown"],
        studio: await getStudio(item.subject_id),
        link: subject.id ? `https://bgm.tv/subject/${subject.id}` : "#",
        progress,
        totalEpisodes,
    };
}

async function main() {
    const config = yaml.load(await readFile(CONFIG_FILE, "utf8"));
    const userId = config?.site?.bangumi?.userId;
    const cache = await readCache();
    if (!userId || ["your-bangumi-id", "your-user-id"].includes(userId)) {
        console.log("Bangumi user ID is not configured; keeping the existing static cache.");
        return;
    }

    try {
        const [watching, completed] = await Promise.all([collection(userId, 3), collection(userId, 2)]);
        const anime = [
            ...(await mapWithConcurrency(watching, (item) => toAnime(item, "watching"))),
            ...(await mapWithConcurrency(completed, (item) => toAnime(item, "completed"))),
        ];
        await writeFile(CACHE_FILE, `${JSON.stringify({ updatedAt: new Date().toISOString(), anime }, null, 2)}\n`);
        console.log(`Saved ${anime.length} Bangumi entries to the static cache.`);
    } catch (error) {
        console.warn(`Bangumi refresh failed; using the ${cache.anime?.length ?? 0}-entry cached snapshot.`, error.message);
    }
}

await main();

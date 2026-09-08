"""Lightweight web search + scraping used to ground answers in live web content,
similar to how ChatGPT's browsing works. Uses DuckDuckGo (no API key needed)
for search, then scrapes the top results' pages for fuller context.

Two search strategies are tried in order:
  1. The `duckduckgo_search` library (fast, structured JSON results)
  2. A raw HTML scrape of DuckDuckGo's no-JS results page as a fallback,
     since the library occasionally gets rate-limited or blocked
This means web search keeps working even when one path fails."""
from typing import List, Dict
import requests
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
}


def _search_via_library(query: str, max_results: int) -> List[Dict]:
    results = []
    try:
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", "") or "Untitled",
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                })
    except Exception:
        return []
    return results


def _search_via_html_scrape(query: str, max_results: int) -> List[Dict]:
    """Fallback: scrape DuckDuckGo's HTML (non-JS) results page directly."""
    results = []
    try:
        resp = requests.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            headers=HEADERS,
            timeout=8,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for result in soup.select(".result")[:max_results]:
            link = result.select_one(".result__a")
            snippet = result.select_one(".result__snippet")
            if not link or not link.get("href"):
                continue
            results.append({
                "title": link.get_text(strip=True) or "Untitled",
                "url": link.get("href"),
                "snippet": snippet.get_text(strip=True) if snippet else "",
            })
    except Exception:
        return []
    return results


def search_web(query: str, max_results: int = 5) -> List[Dict]:
    """Search the web, trying the library first, falling back to an HTML
    scrape if that returns nothing (rate limits, blocks, network hiccups)."""
    results = _search_via_library(query, max_results)
    if not results:
        results = _search_via_html_scrape(query, max_results)
    return results


def scrape_page(url: str, max_chars: int = 3000) -> str:
    """Fetch a page and extract its main readable text. Falls back to empty
    string on any failure (paywalls, timeouts, blocked scraping, etc.)."""
    if not url:
        return ""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=6)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "svg"]):
            tag.decompose()
        text = " ".join(soup.get_text(separator=" ").split())
        return text[:max_chars]
    except Exception:
        return ""


def fetch_web_context(query: str, max_results: int = 4, scrape_top_n: int = 3) -> List[Dict]:
    """Search the web and scrape the top N result pages for richer context.
    Remaining results fall back to their search snippet only (faster, avoids
    hammering too many sites per query)."""
    results = search_web(query, max_results=max_results)
    for i, r in enumerate(results):
        if i < scrape_top_n:
            scraped = scrape_page(r["url"])
            r["content"] = scraped if scraped else r["snippet"]
        else:
            r["content"] = r["snippet"]
    return results

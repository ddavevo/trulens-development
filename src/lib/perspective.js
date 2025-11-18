// TruLens - Perspective Check
// Build diverse search URLs for opposing viewpoints

const sourcesLeft = ["nytimes.com", "washingtonpost.com", "theatlantic.com", "vox.com", "apnews.com"];
const sourcesRight = ["wsj.com", "nationalreview.com", "foxnews.com", "spectator.org", "nypost.com"];
const neutralish = ["reuters.com", "apnews.com", "associatedpress.com", "bbc.com", "economist.com"];

function q(str) {
  return encodeURIComponent(str);
}

/**
 * Build opposing viewpoint search queries
 * @param {string} titleOrTopic - Article title or topic to search for
 * @param {string} lean - "left", "right", or "auto" to determine perspective
 * @returns {Array} Array of search URLs for diverse sources
 */
export function buildOpposingQueries(titleOrTopic, lean = "auto") {
  // If page leans left, show right & neutral; if right, show left & neutral; else show both.
  const topic = (titleOrTopic || document.title || window.location.hostname)
    .replace(/\s+/g, " ")
    .slice(0, 120);
  
  const packs = {
    left: sourcesLeft.map(s => `https://www.google.com/search?q=${q(topic)}+site:${s}`),
    right: sourcesRight.map(s => `https://www.google.com/search?q=${q(topic)}+site:${s}`),
    neutral: neutralish.map(s => `https://www.google.com/search?q=${q(topic)}+site:${s}`)
  };
  
  if (lean === "left") return [...packs.right.slice(0, 3), ...packs.neutral.slice(0, 3)];
  if (lean === "right") return [...packs.left.slice(0, 3), ...packs.neutral.slice(0, 3)];
  
  // Default: show balanced mix from all sides
  return [...packs.left.slice(0, 2), ...packs.right.slice(0, 2), ...packs.neutral.slice(0, 2)];
}


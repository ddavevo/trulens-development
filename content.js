// TruLens Content Script
// Main analysis engine, bubbles, toolbar, and panel UI

(function() {
  'use strict';

  // ============================================================================
  // DOM Utilities
  // ============================================================================

  /**
   * Find visible paragraph-like blocks (p, article p, blockquote, li, .content * with ≥30 chars)
   */
  function visibleParagraphs() {
    const selectors = ['p', 'article p', 'blockquote', 'li', '.content p', '.article p', '.post p'];
    const blocks = [];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent.trim();
        if (text.length >= 30 && isVisible(el)) {
          blocks.push(el);
        }
      }
    }
    
    return [...new Set(blocks)]; // Dedupe
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && 
           window.getComputedStyle(el).visibility !== 'hidden' &&
           window.getComputedStyle(el).display !== 'none';
  }

  /**
   * Aria-safe injection of UI elements
   */
  function injectUI() {
    // Panel
    if (!document.getElementById('trulens-panel')) {
      const panelEl = document.createElement('div');
      panelEl.id = 'trulens-panel';
      panelEl.className = 'trulens-panel';
      panelEl.setAttribute('role', 'dialog');
      panelEl.setAttribute('aria-label', 'TruLens analysis panel');
      panelEl.innerHTML = `
        <div class="trulens-panel-close" aria-label="Close panel">×</div>
        <div class="sources-overview-container">
          <div class="filter-section-top">
            <button class="filter-button-top">Trulens</button>
        </div>
          <div class="tab-navigation">
            <button class="tab-button active" data-tab="references">References</button>
            <button class="tab-button" data-tab="summary">Summary</button>
            <button class="tab-button" data-tab="how-to-use">How to Use</button>
            <button class="tab-button" data-tab="my-highlights">My Highlights</button>
        </div>
        <div class="trulens-panel-content">
            <div class="trulens-panel-section active" id="trulens-references"></div>
            <div class="trulens-panel-section" id="trulens-summary"></div>
            <div class="trulens-panel-section" id="trulens-how-to-use"></div>
            <div class="trulens-panel-section" id="trulens-my-highlights"></div>
          </div>
        </div>
      `;
      document.body.appendChild(panelEl);
      
      // Tab switching
      panelEl.querySelectorAll('.tab-button').forEach(tab => {
        tab.addEventListener('click', () => {
          const tabName = tab.dataset.tab;
          panelEl.querySelectorAll('.tab-button').forEach(t => t.classList.remove('active'));
          panelEl.querySelectorAll('.trulens-panel-section').forEach(s => s.classList.remove('active'));
          tab.classList.add('active');
          document.getElementById(`trulens-${tabName}`).classList.add('active');
          
          // Update content when switching tabs
          if (tabName === 'references') {
            panel.updateReferences();
          } else if (tabName === 'summary') {
            panel.updateSummary();
          } else if (tabName === 'how-to-use') {
            panel.updateHowToUse();
          } else if (tabName === 'my-highlights') {
            panel.updateHighlights();
          }
        });
        tab.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            tab.click();
          }
        });
      });

      // Close button
      panelEl.querySelector('.trulens-panel-close').addEventListener('click', () => panel.hide());
    }

    // Bubble layer
    if (!document.getElementById('trulens-bubble-layer')) {
      const layer = document.createElement('div');
      layer.id = 'trulens-bubble-layer';
      layer.className = 'trulens-bubble-layer';
      document.body.appendChild(layer);
    }

    // Toolbar container
    if (!document.getElementById('trulens-toolbar-container')) {
      const container = document.createElement('div');
      container.id = 'trulens-toolbar-container';
      document.body.appendChild(container);
    }
  }

  // ============================================================================
  // Metrics & Scoring
  // ============================================================================

  /**
   * Extract metrics from text
   */
  function metricsFor(text) {
    // Split sentences (heuristic: [.?!] followed by space/capital)
    const sentences = text.split(/(?<=[.?!])\s+(?=[A-Z])/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) {
      sentences.push(text);
    }

    // Split words
    const words = text.match(/\b\w+\b/g) || [];
    
    // Sentence lengths
    const sentLengths = sentences.map(s => s.split(/\s+/).length);
    const avgSentLen = sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length || 0;
    const variance = sentLengths.reduce((acc, len) => acc + Math.pow(len - avgSentLen, 2), 0) / sentLengths.length || 0;
    const stdSentLen = Math.sqrt(variance);

    // Type-token ratio
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const ttr = words.length > 0 ? uniqueWords.size / words.length : 0;

    // Comma chain rate
    const commaChains = text.match(/,\s+\w+,\s+\w+/g) || [];
    const commaChainRate = sentences.length > 0 ? commaChains.length / sentences.length : 0;

    // 3-gram repetition
    const trigrams = [];
    for (let i = 0; i < words.length - 2; i++) {
      trigrams.push(words.slice(i, i + 3).join(' ').toLowerCase());
    }
    const uniqueTrigrams = new Set(trigrams);
    const repetition = trigrams.length > 0 ? 1 - (uniqueTrigrams.size / trigrams.length) : 0;

    // Punctuation rate
    const punct = (text.match(/[.,!?;:]/g) || []).length;
    const punctRate = text.length > 0 ? punct / text.length : 0;

    // Quotes
    const quotes = (text.match(/[""''].*?[""'']/g) || []).length;

    // Opinion markers
    const opinionPattern = /(clearly|obviously|undeniably|we must|everyone knows)/gi;
    const opinion = (text.match(opinionPattern) || []).length;

    // Balance markers
    const balancePattern = /(however|on the other hand|critics (say|argue))/gi;
    const balance = (text.match(balancePattern) || []).length;

    return {
      avgSentLen,
      stdSentLen,
      ttr,
      commaChainRate,
      repetition,
      punctRate,
      quotes,
      opinion,
      balance,
      sentences: sentences.length,
      words: words.length
    };
  }

  /**
   * Score metrics to label (0-100, higher = more AI-like)
   */
  async function scoreMetrics(m) {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_WEIGHTS' });
    } catch (error) {
      // Extension context invalidated or other runtime errors
      response = { data: null };
    }
    const weights = response?.data || {
      avgSentLen: 0.15,
      stdSentLen: 0.10,
      ttr: 0.20,
      commaChainRate: 0.05,
      repetition: 0.15,
      punctRate: 0.05,
      quotes: 0.10,
      opinion: 0.10,
      balance: 0.10
    };

    // Normalize and weight
    let score = 0;
    
    // Higher avg sent len → more AI-like (scale to 0-1)
    score += Math.min(1, m.avgSentLen / 30) * weights.avgSentLen * 100;
    
    // Lower std → more AI-like
    score += Math.max(0, 1 - Math.min(1, m.stdSentLen / 15)) * weights.stdSentLen * 100;
    
    // Lower TTR → more AI-like
    score += Math.max(0, 1 - m.ttr) * weights.ttr * 100;
    
    // Higher comma chains → more AI-like
    score += Math.min(1, m.commaChainRate) * weights.commaChainRate * 100;
    
    // Higher repetition → more AI-like
    score += m.repetition * weights.repetition * 100;
    
    // Lower punct rate → more AI-like
    score += Math.max(0, 1 - m.punctRate * 10) * weights.punctRate * 100;
    
    // Lower quotes → more AI-like
    score += Math.max(0, 1 - Math.min(1, m.quotes / 5)) * weights.quotes * 100;
    
    // Higher opinion → more AI-like
    score += Math.min(1, m.opinion / 5) * weights.opinion * 100;
    
    // Lower balance → more AI-like
    score += Math.max(0, 1 - Math.min(1, m.balance / 3)) * weights.balance * 100;

    // Clamp
    score = Math.max(0, Math.min(100, score));

    // Determine label
    let label, confidence;
    if (score >= 60) {
      label = 'Likely AI';
      confidence = 'steady';
    } else if (score >= 40) {
      label = 'Mixed';
      confidence = 'tentative';
    } else {
      label = 'Likely Human';
      confidence = 'steady';
    }

    // Generate reasons (top 3 triggered cues)
    const reasons = [];
    if (m.ttr < 0.3) reasons.push('Low word variety suggests automated generation');
    if (m.repetition > 0.3) reasons.push('High repetition of phrases detected');
    if (m.opinion > 2 && m.quotes === 0) reasons.push('Strong claims without source quotes');
    if (m.stdSentLen < 5) reasons.push('Uniform sentence lengths');
    if (m.balance === 0 && m.opinion > 0) reasons.push('Opinionated without balancing perspectives');
    if (m.quotes === 0 && m.sentences > 10) reasons.push('Long text without quoted sources');
    if (reasons.length === 0) {
      reasons.push('Mixed signals detected');
    }

    return {
      score,
      label,
      confidence,
      reasons: reasons.slice(0, 3)
    };
  }

  /**
   * Page-level decision from blocks
   */
  async function pageDecision(blocks) {
    if (!blocks || blocks.length === 0) {
      return {
        score: 0,
        label: 'Unknown',
        confidence: 'tentative',
        reasons: ['No readable content found'],
        metrics: {},
        blockScores: []
      };
    }
    const text = blocks.map(b => b.textContent).join(' ').trim();
    const metrics = metricsFor(text);
    const scored = await scoreMetrics(metrics);
    
    // Also analyze individual blocks for granularity
    const blockScores = [];
    for (const block of blocks.slice(0, 10)) { // Limit to first 10 blocks
      const blockText = block.textContent.trim();
      if (blockText.length >= 30) {
        const blockMetrics = metricsFor(blockText);
        const blockScored = await scoreMetrics(blockMetrics);
        blockScores.push(blockScored);
      }
    }

    return {
      ...scored,
      label: scored.label || 'Unknown',
      confidence: scored.confidence || 'tentative',
      reasons: scored.reasons || ['Mixed signals'],
      score: typeof scored.score === 'number' ? scored.score : 0,
      metrics,
      blockScores
    };
  }

  // ============================================================================
  // Perspective
  // ============================================================================

  /**
   * Extract top topic (H1, og:title, or first capitalized noun phrase)
   */
  function topTopic(text) {
    // Try H1
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim()) {
      return h1.textContent.trim().substring(0, 50);
    }

    // Try og:title
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) {
      return ogTitle.content.substring(0, 50);
    }

    // Try title tag
    const title = document.title;
    if (title && title.trim()) {
      return title.substring(0, 50);
    }

    // First capitalized noun phrase (simple heuristic)
    const match = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/);
    if (match) {
      return match[1].substring(0, 50);
    }

    return 'Current page';
  }

  /**
   * Polarization score (Low/Med/High)
   */
  function polarizationScore(text) {
    const partisanTerms = /(radical|extremist|conspiracy|woke|fake news|deep state)/gi;
    const opinionMarkers = /(clearly|obviously|undeniably|everyone knows|without doubt)/gi;
    
    const partisanHits = (text.match(partisanTerms) || []).length;
    const opinionHits = (text.match(opinionMarkers) || []).length;
    const quotes = (text.match(/[""''].*?[""'']/g) || []).length;
    const balanceHits = (text.match(/(however|on the other hand|critics (say|argue))/gi) || []).length;

    let score = 0;
    score += Math.min(partisanHits * 20, 40);
    score += Math.min(opinionHits * 10, 30);
    score -= Math.min(quotes * 5, 20);
    score -= Math.min(balanceHits * 10, 20);

    score = Math.max(0, Math.min(100, score));

    let band, reasons;
    if (score >= 60) {
      band = 'High';
      reasons = ['Strong partisan language detected', 'High opinion markers', 'Lacks balanced perspectives'];
    } else if (score >= 30) {
      band = 'Med';
      reasons = ['Some opinionated language', 'Limited source quotes'];
    } else {
      band = 'Low';
      reasons = ['Relatively neutral tone', 'Includes balancing perspectives'];
    }

    return { band, score, reasons };
  }

  /**
   * Build perspective links (Google queries per group)
   */
  async function buildPerspectiveLinks(topic) {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' });
    } catch (e) {
      response = { data: null };
    }
    const settings = response.data || {};
    const customSources = settings.perspectiveSources || {};

    const defaultSources = {
      National: customSources.National || ['nytimes.com', 'wsj.com', 'usatoday.com'],
      International: customSources.International || ['bbc.com', 'theguardian.com', 'reuters.com', 'aljazeera.com'],
      Business: customSources.Business || ['bloomberg.com', 'ft.com'],
      'Public broadcaster': customSources['Public broadcaster'] || ['npr.org', 'pbs.org'],
      'Fact-checks': customSources['Fact-checks'] || ['apnews.com', 'politifact.com', 'snopes.com']
    };

    const links = [];
    const query = encodeURIComponent(topic);

    for (const [group, domains] of Object.entries(defaultSources)) {
      for (const domain of domains) {
        const url = `https://www.google.com/search?q=site:${domain}+${query}`;
        links.push({
          group,
          domain,
          url,
          label: `${domain} coverage`
        });
      }
    }

    return links;
  }

  /**
   * Fetch article data with excerpts and titles from sources
   */
  async function fetchArticleData(topic, sources) {
    const articles = [];
    
    // Request article data from background script
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRULENS_FETCH_ARTICLES',
        topic: topic,
        sources: sources
      });
      
      if (response && response.success && response.data) {
        return response.data;
      }
    } catch (error) {
      console.warn('Failed to fetch article data:', error);
    }

    // Fallback: create article data structure from sources
    // In a real implementation, this would fetch actual article data
    for (const source of sources) {
      articles.push({
        url: source.url,
        title: `Coverage on ${source.domain}`,
        excerpt: `Find articles about "${topic}" from ${source.domain}. Click to view search results.`,
        source: source.domain,
        domain: source.domain,
        relevance: 0.5,
        angle: source.group || 'General'
      });
    }

    return articles;
  }

  /**
   * Calculate relevance score based on topic matching
   */
  function calculateRelevance(article, topic) {
    const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const articleText = `${article.title} ${article.excerpt}`.toLowerCase();
    
    let matches = 0;
    for (const word of topicWords) {
      if (articleText.includes(word)) {
        matches++;
      }
    }
    
    return topicWords.length > 0 ? matches / topicWords.length : 0.5;
  }

  /**
   * Calculate distinctness score based on angle/perspective diversity
   */
  function calculateDistinctness(article, otherArticles) {
    if (otherArticles.length === 0) return 1.0;
    
    // Check if this article has a different angle/perspective
    const sameDomain = otherArticles.filter(a => a.domain === article.domain).length;
    const sameAngle = otherArticles.filter(a => a.angle === article.angle).length;
    
    // Prefer articles from different domains and angles
    // Higher distinctness = more unique perspective
    let distinctness = 1.0;
    
    // Penalize if same domain already appears (want diverse sources)
    if (sameDomain > 0) distinctness -= 0.4;
    
    // Penalize if too many articles from same angle/category
    // But allow some from same angle if they're from different sources
    if (sameAngle > 3) distinctness -= 0.3;
    else if (sameAngle > 1 && sameDomain === 0) distinctness -= 0.1; // Different source, same angle is OK
    
    // Boost distinctness for fact-check sources (valuable perspective)
    if (article.angle === 'Fact-checks') distinctness += 0.2;
    
    // Boost distinctness for international sources (different perspective)
    if (article.angle === 'International') distinctness += 0.15;
    
    return Math.max(0.1, Math.min(1.0, distinctness));
  }

  /**
   * Rank articles by relevance and distinctness
   */
  function rankArticles(articles, topic) {
    const ranked = articles.map(article => {
      const relevance = calculateRelevance(article, topic);
      const distinctness = calculateDistinctness(article, articles.filter(a => a !== article));
      
      // Combined score: 60% relevance, 40% distinctness
      const score = (relevance * 0.6) + (distinctness * 0.4);
      
      return {
        ...article,
        relevance,
        distinctness,
        score
      };
    });

    // Sort by score (highest first)
    ranked.sort((a, b) => b.score - a.score);
    
    return ranked;
  }

  // ============================================================================
  // Smart Bubbles Manager
  // ============================================================================

  class BubbleManager {
    constructor() {
      this.observer = null;
      this.activeBubbles = [];
      this.lastBubbleTime = 0;
      this.debounceMs = 8000; // 8s between bubbles
      this.maxActive = 2;
      this.autoDismissMs = 6000; // 6s auto-dismiss
      this.settings = { smartBubbles: true, quietMode: false };
      this.init();
    }

    async init() {
      let response;
      try {
        response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' });
      } catch (e) {
        response = { data: null };
      }
      this.settings = response.data || this.settings;
      
      if (this.settings.smartBubbles && !this.settings.quietMode) {
        this.start();
      }
    }

    start() {
      if (this.observer) return;

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.observer = new IntersectionObserver((entries) => {
        if (!this.settings.smartBubbles || this.settings.quietMode) return;
        
        const now = Date.now();
        if (now - this.lastBubbleTime < this.debounceMs) return;
        if (this.activeBubbles.length >= this.maxActive) return;

        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
            const block = entry.target;
            if (block.dataset.trulensObserved) continue;
            block.dataset.trulensObserved = 'true';

            this.lastBubbleTime = now;
            this.showBubble(block, prefersReducedMotion);
            break; // One bubble per trigger
          }
        }
      }, {
        threshold: [0.4],
        rootMargin: '0px'
      });

      // Observe paragraphs
      const blocks = visibleParagraphs();
      for (const block of blocks) {
        this.observer.observe(block);
      }

      // Re-observe on DOM changes (debounced)
      const mutationObserver = new MutationObserver(() => {
        setTimeout(() => {
          const blocks = visibleParagraphs();
          for (const block of blocks) {
            if (!block.dataset.trulensObserved) {
              this.observer?.observe(block);
            }
          }
        }, 500);
      });

      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    async showBubble(block, prefersReducedMotion) {
      const text = block.textContent.trim();
      if (text.length < 30) return;

      const metrics = metricsFor(text);
      const scored = await scoreMetrics(metrics);

      // Determine bubble message and action
      let message, actionLabel, actionType;
      
      if (metrics.opinion > 0 && metrics.quotes === 0) {
        message = "Strong claim, no quotes—want broader coverage?";
        actionLabel = "See other coverage";
        actionType = "coverage";
      } else if (metrics.repetition > 0.3) {
        message = "Repetition detected—open opposing coverage?";
        actionLabel = "Find fact-checks";
        actionType = "factchecks";
      } else {
        const domain = window.location.hostname;
        if (domain && !domain.includes('localhost')) {
          message = "Who's the source? Check their About page.";
          actionLabel = "Check source";
          actionType = "source";
        } else {
          message = "Check the source";
          actionLabel = "Check source";
          actionType = "source";
        }
      }

      // Create bubble element
      const bubble = document.createElement('div');
      bubble.className = 'trulens-bubble';
      bubble.setAttribute('role', 'alert');
      
      const bubbleId = `trulens-bubble-${Date.now()}`;
      bubble.id = bubbleId;

      const rect = block.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;

      // Position in gutter (right side, never cover text)
      const left = rect.right + 20;
      const top = rect.top + scrollY;

      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;

      bubble.innerHTML = `
        <div class="trulens-bubble-message">${message}</div>
        <div class="trulens-bubble-actions">
          <button class="trulens-bubble-button" data-action="${actionType}">${actionLabel}</button>
        </div>
        <button class="trulens-bubble-close" aria-label="Close bubble">×</button>
      `;

      const layer = document.getElementById('trulens-bubble-layer');
      if (layer) {
        layer.appendChild(bubble);

        // Show with animation (unless reduced motion)
        requestAnimationFrame(() => {
          bubble.classList.add('visible');
        });

        // Auto-dismiss
        const dismissTimer = setTimeout(() => {
          this.dismissBubble(bubbleId, prefersReducedMotion);
        }, this.autoDismissMs);

        // Action handler
        bubble.querySelector('.trulens-bubble-button').addEventListener('click', async () => {
          clearTimeout(dismissTimer);
          await this.handleBubbleAction(actionType, text);
          this.dismissBubble(bubbleId, prefersReducedMotion);
        });

        // Close handler
        bubble.querySelector('.trulens-bubble-close').addEventListener('click', () => {
          clearTimeout(dismissTimer);
          this.dismissBubble(bubbleId, prefersReducedMotion);
        });

        // Esc key
        const escHandler = (e) => {
          if (e.key === 'Escape' && document.activeElement.closest('.trulens-bubble') === bubble) {
            clearTimeout(dismissTimer);
            this.dismissBubble(bubbleId, prefersReducedMotion);
            document.removeEventListener('keydown', escHandler);
          }
        };
        document.addEventListener('keydown', escHandler);

        // Focus management
        bubble.querySelector('.trulens-bubble-button').focus();

        this.activeBubbles.push(bubbleId);

        // Reposition on scroll
        const reposition = () => {
          const newRect = block.getBoundingClientRect();
          const newLeft = newRect.right + 20;
          const newTop = newRect.top + window.scrollY;
          bubble.style.left = `${newLeft}px`;
          bubble.style.top = `${newTop}px`;
        };

        const scrollHandler = () => {
          if (document.body.contains(block)) {
            reposition();
          } else {
            this.dismissBubble(bubbleId, prefersReducedMotion);
          }
        };

        window.addEventListener('scroll', scrollHandler, { passive: true });
        window.addEventListener('resize', reposition);

        // Cleanup on dismiss
        bubble.dataset.repositionHandlers = 'true';
        bubble.dataset.scrollHandler = scrollHandler.toString();
      }
    }

    async handleBubbleAction(type, text) {
      const topic = topTopic(text);

      if (type === 'coverage' || type === 'factchecks') {
        const links = await buildPerspectiveLinks(topic);
        const relevantLinks = type === 'factchecks' 
          ? links.filter(l => l.group === 'Fact-checks')
          : links.filter(l => l.group !== 'Fact-checks');
        
        for (const link of relevantLinks.slice(0, 3)) {
          window.open(link.url, '_blank');
        }
      } else if (type === 'source') {
        const domain = window.location.hostname;
        const aboutUrl = `${window.location.protocol}//${domain}/about`;
        window.open(aboutUrl, '_blank');
      }
    }

    dismissBubble(bubbleId, prefersReducedMotion) {
      const bubble = document.getElementById(bubbleId);
      if (!bubble) return;

      if (prefersReducedMotion) {
        bubble.remove();
      } else {
        bubble.classList.add('collapsed');
        setTimeout(() => bubble.remove(), 300);
      }

      this.activeBubbles = this.activeBubbles.filter(id => id !== bubbleId);
    }

    stop() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      
      // Dismiss all bubbles
      for (const bubbleId of [...this.activeBubbles]) {
        const bubble = document.getElementById(bubbleId);
        if (bubble) bubble.remove();
      }
      this.activeBubbles = [];
    }

    async updateSettings() {
      let response;
      try {
        response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' });
      } catch (e) {
        response = { data: null };
      }
      this.settings = response.data || this.settings;
      
      if (this.settings.smartBubbles && !this.settings.quietMode) {
        this.start();
      } else {
        this.stop();
      }
    }
  }

  // ============================================================================
  // Selection Toolbar
  // ============================================================================

  class SelectionWatcher {
    constructor() {
      this.toolbar = null;
      this.settings = { selectionToolbar: true };
      this.init();
    }

    async init() {
      let response;
      try {
        response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' });
      } catch (e) {
        response = { data: null };
      }
      this.settings = response.data || this.settings;
      
      if (this.settings.selectionToolbar) {
        this.start();
      }
    }

    start() {
      document.addEventListener('selectionchange', () => this.handleSelection());
      document.addEventListener('mouseup', () => this.handleSelection());
    }

    async handleSelection() {
      // Don't handle selection if we're currently handling a button action
      if (this.isHandlingAction) {
        return;
      }
      
      // Don't handle selection if clicking on the toolbar
      if (this.toolbar && document.activeElement && this.toolbar.contains(document.activeElement)) {
        return;
      }
      
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (!text || text.length < 3) {
        this.hideToolbar();
        return;
      }

      if (!selection.rangeCount) {
        this.hideToolbar();
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (rect.width === 0 && rect.height === 0) {
        this.hideToolbar();
        return;
      }

      await this.showToolbar(text, rect);
    }

    async showToolbar(text, rect) {
      if (!this.toolbar) {
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'trulens-toolbar';
        this.toolbar.setAttribute('role', 'toolbar');
        this.toolbar.setAttribute('aria-label', 'Selection actions');
        const container = document.getElementById('trulens-toolbar-container');
        if (!container) {
          console.error('[Trulens] Toolbar container not found!');
          return;
        }
        container.appendChild(this.toolbar);
      }
      
      // Store the current text for use in event handlers
      this.currentText = text;

      // Determine reliability (placeholder logic - replace with actual reliability scoring)
      const getReliability = (text) => {
        // Simple placeholder: alternate based on text length for demo
        const reliabilities = ['reliable', 'less-reliable', 'not-reliable'];
        return reliabilities[0]; // text.length % 3
      };

      const getReliabilityIcon = (reliability) => {
        const icons = {
          'reliable': chrome.runtime.getURL('assets/lets-icons_check-fill.svg'),
          'less-reliable': chrome.runtime.getURL('assets/icon-park-solid_caution.svg'),
          'not-reliable': chrome.runtime.getURL('assets/solar_danger-bold.svg')
        };
        return icons[reliability] || '';
      };

      const reliability = getReliability(text);
      const reliabilityLabels = {
        'reliable': 'Reliable',
        'less-reliable': 'Less Reliable',
        'not-reliable': 'Not Reliable'
      };
      const reliabilityIcon = getReliabilityIcon(reliability);

      // Generate rationale text (placeholder - replace with actual analysis)
      const rationaleText = 'Based on the latest census data, the number of New Jerseyans impacted by SNAP is consistent within ±5%. The debit accounts refer to EBT cards used to administer SNAP benefits.';

      this.toolbar.innerHTML = `
        <div class="trulens-toolbar-content">
          <div class="trulens-toolbar-header">
            <div class="trulens-toolbar-reliability-badge ${reliability}">
              ${reliabilityIcon ? `<img src="${reliabilityIcon}" alt="${reliabilityLabels[reliability]}" class="toolbar-badge-icon">` : ''}
              <span>${reliabilityLabels[reliability]}</span>
            </div>
          </div>
          <div class="trulens-toolbar-rationale">
            ${escapeHtml(rationaleText)}
          </div>
          <div class="trulens-toolbar-actions">
            <button class="trulens-toolbar-save-button" data-action="save">Save highlight</button>
            <button class="trulens-toolbar-explore-link" data-action="explore">Explore this topic</button>
          </div>
        </div>
      `;

      // Position above selection
      const toolbarRect = this.toolbar.getBoundingClientRect();
      const left = rect.left + (rect.width / 2) - (toolbarRect.width / 2);
      const top = rect.top - toolbarRect.height - 8;

      this.toolbar.style.left = `${Math.max(8, left)}px`;
      this.toolbar.style.top = `${Math.max(8, top)}px`;
      this.toolbar.style.display = 'block';

      // Store the current text for use in event handlers
      this.currentText = text;
      console.log('[Trulens] Toolbar shown with text length:', text ? text.length : 0);

      // Use event delegation on the toolbar to handle clicks
      // This avoids issues with event listeners being lost when innerHTML is updated
      // Remove any existing listeners first
      const newToolbar = this.toolbar.cloneNode(true);
      this.toolbar.parentNode.replaceChild(newToolbar, this.toolbar);
      this.toolbar = newToolbar;
      
      // Add click handler with capture phase to catch it early
      this.toolbar.addEventListener('click', async (e) => {
        console.log('[Trulens] Toolbar clicked, target:', e.target, 'closest:', e.target.closest('[data-action]'));
        
        // Stop the event from propagating to document level
        e.stopPropagation();
        e.preventDefault();
        e.stopImmediatePropagation();
        
        // Prevent selection from being cleared
        if (window.getSelection) {
          const sel = window.getSelection();
          if (sel.rangeCount > 0) {
            // Keep the selection temporarily
            this.savedSelection = sel.getRangeAt(0).cloneRange();
          }
        }
        
        const btn = e.target.closest('[data-action]');
        if (!btn) {
          console.log('[Trulens] No button with data-action found');
          return;
        }
        
        const action = btn.dataset.action;
        const actionText = this.currentText || text;
        
        console.log('[Trulens] Button clicked via delegation:', action, 'Text length:', actionText ? actionText.length : 0);
        
        // Visual feedback
        btn.style.opacity = '0.6';
        setTimeout(() => {
          if (btn.parentNode) {
            btn.style.opacity = '1';
          }
        }, 200);
        
        if (!actionText || !actionText.trim()) {
          console.error('[Trulens] No text available for action');
          return;
        }
        
        // Prevent selection change from interfering by using a flag
        this.isHandlingAction = true;
        setTimeout(async () => {
          await this.handleAction(action, actionText);
          this.isHandlingAction = false;
        }, 10);
      }, true); // Use capture phase to catch the event early
      
      // Keyboard support
      this.toolbar.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const btn = e.target.closest('[data-action]');
          if (btn) {
            e.preventDefault();
            btn.click();
          }
        }
      };

      // Esc to hide
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          this.hideToolbar();
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);

      // Reposition on scroll
      const reposition = () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const newRect = range.getBoundingClientRect();
          const toolbarRect = this.toolbar.getBoundingClientRect();
          const left = newRect.left + (newRect.width / 2) - (toolbarRect.width / 2);
          const top = newRect.top - toolbarRect.height - 8;
          this.toolbar.style.left = `${Math.max(8, left)}px`;
          this.toolbar.style.top = `${Math.max(8, top)}px`;
        } else {
          this.hideToolbar();
        }
      };

      window.addEventListener('scroll', reposition, { passive: true });
      window.addEventListener('resize', reposition);
    }

    async handleAction(action, text) {
      console.log('[Trulens] handleAction called:', action, 'Text length:', text ? text.length : 0);
      if (action === 'save') {
        if (!text || !text.trim()) {
          console.error('[Trulens] Cannot save: no text provided');
          return;
        }
        
        // Save the exact selected text (no truncation)
        const excerpt = {
          text: text.trim(),
          url: window.location.href,
          timestamp: Date.now(),
          title: document.title
        };
        
        console.log('[Trulens] Saving highlight:', excerpt);
        
        let response;
        try {
          response = await chrome.runtime.sendMessage({ 
            type: 'TRULENS_GET_HIGHLIGHTS' 
          });
          console.log('[Trulens] Get highlights response:', response);
        } catch (e) {
          console.error('[Trulens] Error getting highlights:', e);
          response = { success: false, data: null };
        }
        
        // Handle response format from background script
        const highlights = (response && response.success && response.data) ? response.data : [];
        console.log('[Trulens] Current highlights count:', highlights.length);
        highlights.unshift(excerpt);
        
        try {
          const saveResponse = await chrome.runtime.sendMessage({
            type: 'TRULENS_SET_HIGHLIGHTS',
            highlights: highlights.slice(0, 100) // Keep last 100
          });
          console.log('[Trulens] Save highlights response:', saveResponse);
        } catch (e) {
          console.error('[Trulens] Failed to save highlight:', e);
        }

        // Always update the highlights tab if it exists (whether active or not)
        // This ensures the highlight appears when the user switches to the tab
        const highlightsTab = document.getElementById('trulens-my-highlights');
        const isHighlightsTabActive = highlightsTab && highlightsTab.classList.contains('active');
        
        if (highlightsTab) {
          // Refresh the highlights display
          await panel.updateHighlights();
          
          // Auto-expand the source header for the newly saved highlight
          // Extract source name from the saved highlight
          let sourceName = 'Unknown';
          try {
            const domain = new URL(excerpt.url).hostname.replace('www.', '');
            const parts = domain.split('.');
            if (parts.length > 0) {
              const baseName = parts[0];
              if (baseName.length <= 4) {
                sourceName = baseName.toUpperCase();
              } else {
                sourceName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
              }
            }
          } catch (e) {
            // Use default
          }
          
          // Find and expand the source header
          const sourceId = `source-${sourceName.toLowerCase().replace(/\s+/g, '-')}`;
          const sourceHeader = highlightsTab.querySelector(`[data-source-header="${sourceId}"]`);
          const sourceContent = highlightsTab.querySelector(`[data-source-content="${sourceId}"]`);
          
          if (sourceHeader && sourceContent) {
            // Expand the source header
            sourceHeader.classList.remove('collapsed');
            sourceHeader.classList.add('expanded');
            sourceContent.style.display = 'flex';
            
            // Rotate chevron
            const chevron = sourceHeader.querySelector('.highlight-chevron svg');
            if (chevron) {
              chevron.style.transform = 'rotate(180deg)';
            }
            
            // Scroll the new highlight into view if tab is active
            if (isHighlightsTabActive) {
              setTimeout(() => {
                const firstHighlight = sourceContent.querySelector('.highlight-card-expanded');
                if (firstHighlight) {
                  firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
              }, 100);
            }
          }
        }

        this.hideToolbar();
      } else if (action === 'explore') {
        // Explore this topic - open related articles
        const topic = topTopic(text);
        const links = await buildPerspectiveLinks(topic);
        for (const link of links.slice(0, 5)) {
          window.open(link.url, '_blank');
        }
        this.hideToolbar();
      }
    }

    hideToolbar() {
      if (this.toolbar) {
        this.toolbar.style.display = 'none';
      }
    }

    async updateSettings() {
      let response;
      try {
        response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' });
      } catch (e) {
        response = { data: null };
      }
      this.settings = response.data || this.settings;
      
      if (!this.settings.selectionToolbar) {
        this.hideToolbar();
      }
    }
  }

  // ============================================================================
  // Panel UI
  // ============================================================================

  const panel = {
    isOpen: false,

    toggle() {
      if (this.isOpen) {
        this.hide();
      } else {
        this.show();
      }
    },

    show() {
      const panelEl = document.getElementById('trulens-panel');
      if (panelEl) {
        panelEl.classList.add('open');
        this.isOpen = true;
        // Default to References tab
        this.updateReferences();
      }
    },

    hide() {
      const panelEl = document.getElementById('trulens-panel');
      if (panelEl) {
        panelEl.classList.remove('open');
        this.isOpen = false;
      }
    },

    async updateOverview() {
      const overviewEl = document.getElementById('trulens-overview');
      if (!overviewEl) return;

      // Get latest scan or scan now
      let response;
      try {
        response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_LATEST' });
      } catch (e) {
        response = { data: null };
      }
      let decision = response.data;

      // ---- SAFETY NORMALIZATION PATCH ----
      if (!decision || typeof decision !== 'object') {
        decision = {};
      }
      if (!decision.label || typeof decision.label !== 'string') {
        decision.label = 'Unknown';
      }
      if (!decision.confidence) {
        decision.confidence = 'tentative';
      }
      if (!Array.isArray(decision.reasons)) {
        decision.reasons = ['No analysis available'];
      }
      if (typeof decision.score !== 'number') {
        decision.score = 0;
      }
      // ---- END PATCH ----

      if (!decision || decision.url !== window.location.href) {
        // Scan now
        const blocks = visibleParagraphs();
        decision = await pageDecision(blocks);
        
        // Save
        try {
          await chrome.runtime.sendMessage({
            type: 'TRULENS_SAVE',
            payload: {
              url: window.location.href,
              ts: Date.now(),
              overall: decision.label,
              reasons: decision.reasons,
              confidence: decision.confidence,
              score: decision.score
            }
          });
        } catch (e) {
          // Extension context invalidated - continue silently
        }
      }

      // Safe labelClass computation
      const safeLabel = typeof decision.label === 'string' ? decision.label : 'Unknown';
      const labelClass =
        safeLabel.includes('AI') ? 'ai' :
        safeLabel.includes('Mixed') ? 'mixed' :
        'human';

      // Render overview
      overviewEl.innerHTML = `
        <div class="trulens-overview-label">${decision.label}</div>
        <div class="trulens-overview-confidence">confidence: ${decision.confidence}</div>
        <ul class="trulens-reasons">
          ${(decision.reasons || []).map(r => `<li>${r}</li>`).join('')}
        </ul>
        <button class="trulens-show-details">Show details</button>
        <div class="trulens-details">Score: ${Math.round(decision.score)}/100</div>
      `;

      overviewEl.querySelector('.trulens-show-details').addEventListener('click', (e) => {
        const details = overviewEl.querySelector('.trulens-details');
        details.classList.toggle('visible');
        e.target.textContent = details.classList.contains('visible') ? 'Hide details' : 'Show details';
      });

    },

    async updateReferences() {
      const referencesEl = document.getElementById('trulens-references');
      if (!referencesEl) return;

      // Keep infrastructure functions for future use, but use hardcoded content for now
      // const blocks = visibleParagraphs();
      // const text = blocks.map(b => b.textContent).join(' ').trim();
      // const topic = topTopic(text);
      // const links = await buildPerspectiveLinks(topic);
      // const articles = await fetchArticleData(topic, links);
      // const rankedArticles = rankArticles(articles, topic);

      const getReliabilityIcon = (reliability) => {
        const icons = {
          'reliable': chrome.runtime.getURL('assets/lets-icons_check-fill.svg'),
          'less-reliable': chrome.runtime.getURL('assets/icon-park-solid_caution.svg'),
          'not-reliable': chrome.runtime.getURL('assets/solar_danger-bold.svg')
        };
        return icons[reliability] || '';
      };

      // Hardcoded talking points based on the design
      const talkingPoints = [
        { percentage: 92, text: '42 million people could be affected' },
        { percentage: 57, text: "USDA's funding decision / partial funding" },
        { percentage: 57, text: 'Food-banks and states scrambling / emergency measures' },
        { percentage: null, text: 'Court rulings, states & coalitions suing, Undoing full payments, child hunger, etc.', hasMore: true }
      ];

      // Hardcoded source articles based on the design
      const hardcodedArticles = [
        {
          excerpt: "This raises concerns about what the future holds for SNAP users. In Florida's Palm Beach and Treasure Coast regions alone, nearly 250,000 individuals depend on SNAP benefits.",
          title: 'SNAP benefits to continue amid government shutdo...',
          source: 'WPTV',
          url: '#',
          reliability: 'reliable',
          domain: 'wptv.com'
        },
        {
          excerpt: "It will be the first such disruption to the federally funded but state-administered safety net program that disproportionately feeds women, children, disabled people and the eld...",
          title: 'SNAP Benefits for 42 Million People Could Still Be S...',
          source: 'Truthout',
          url: '#',
          reliability: 'less-reliable',
          domain: 'truthout.org'
        },
        {
          excerpt: "the federal shutdown happened because Congress failed to pass funding bills or a continuing resolution to keep federal spending authorized. In the absence of that authorization,...",
          title: 'Federal Shutdown Starts To Hit Home In Guilford C...',
          source: 'RHINO Times',
          url: '#',
          reliability: 'not-reliable',
          domain: 'rhinotimes.com'
        }
      ];

      const reliabilityLabels = {
        'reliable': 'Reliable',
        'less-reliable': 'Less Reliable',
        'not-reliable': 'Not Reliable'
      };

      // Render new References Overview UI with hardcoded content
      referencesEl.innerHTML = `
        <div class="sources-overview">
          <!-- Main Content -->
          <div class="main-content">
            <!-- Warning Box - Reliable -->
            <div class="warning-box" style="background-color: var(--reliable-bg, #dfffd4); border-color: var(--reliable-content, #216909);">
              <div class="warning-box-header">
                <img src="${chrome.runtime.getURL('assets/lets-icons_check-fill.svg')}" alt="Reliable" class="warning-icon">
                <span class="warning-label" style="color: var(--reliable-content, #216909);">Reliable</span>
              </div>
              <p class="warning-text" style="color: var(--reliable-content, #216909);">This article is factually reliable and matches what national outlets report, but its local focus may introduce a mild emphasis on New Jersey's hardship. Please do your own due diligence regardless.</p>
            </div>

            <!-- Talking Point Breakdown -->
            <div class="talking-points-section">
              <div class="section-header">
                <h2 class="section-title">Talking point breakdown</h2>
                <p class="section-subtitle">Click into them to explore topics further.</p>
              </div>
              <div class="talking-points-list">
                ${talkingPoints.map((point, index) => {
                  if (point.hasMore) {
                    return `
                      <div class="talking-point-item-row">
                        <span class="talking-point-item-row-text">${point.percentage !== null ? point.percentage + '% - ' : ''}${escapeHtml(point.text)}</span>
                        <button class="more-button" data-point-index="${index}">+ More</button>
                      </div>
                    `;
                  } else {
                    return `
                      <div class="talking-point-item">
                        <span class="talking-point-text">${point.percentage}% - ${escapeHtml(point.text)}</span>
                      </div>
                    `;
                  }
                }).join('')}
              </div>
            </div>

            <!-- Other Angles Section -->
            <div class="other-angles-section">
              <div class="section-header-row">
                <h2 class="section-title">Other angles on this topic</h2>
                <button class="filter-icon-button" aria-label="Filter">
                  <img src="${chrome.runtime.getURL('assets/mdi_filter.svg')}" alt="Filter" class="filter-icon">
                </button>
              </div>
              <div class="source-cards-list">
                ${hardcodedArticles.map((article) => {
                  const reliability = article.reliability;
                  const reliabilityIcon = getReliabilityIcon(reliability);
                  const avatarColor = '#e02424'; // Default, could be customized per domain
                  
                  return `
                    <div class="source-card" data-reliability="${reliability}">
                      <p class="source-quote">${escapeHtml(article.excerpt)}</p>
                      <div class="source-meta">
                        <div class="source-title-row">
                          <a href="${article.url}" target="_blank" rel="noopener" class="source-title">${escapeHtml(article.title)}</a>
            </div>
                        <div class="source-footer">
                          <div class="source-publisher">
                            <div class="publisher-avatar" style="background-color: ${avatarColor}"></div>
                            <span class="publisher-name">${escapeHtml(article.source)}</span>
                          </div>
                          <div class="reliability-badge ${reliability}">
                            <div>
                              ${reliabilityIcon ? `<img src="${reliabilityIcon}" alt="${reliabilityLabels[reliability]}" class="badge-icon">` : ''}
                              <span>${reliabilityLabels[reliability]}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>
      `;

      // Setup interactivity
      setupSourcesInteractivity(referencesEl, talkingPoints);
    },

    async updateSummary() {
      const summaryEl = document.getElementById('trulens-summary');
      if (!summaryEl) return;
      
      // Summary tab content based on Figma design
      summaryEl.innerHTML = `
        <div class="summary-body-section">
          <!-- Overview Container -->
          <div class="summary-container">
            <div class="summary-subtitle">Overview</div>
            <div class="summary-box">
              <div class="summary-text">
                <p>More than 800,000 residents in New Jersey are facing the loss of their SNAP benefits as of November 1, due to a lapse in federal funding tied to the ongoing government shutdown.</p>
                <p>This cutoff threatens roughly 42 million Americans nationwide who rely on SNAP, with state food-banks already reporting serious strain and accelerating emergency funding in response.</p>
              </div>
            </div>
          </div>

          <!-- Stance/Lean Container -->
          <div class="summary-container">
            <div class="summary-subtitle">Stance/Lean</div>
            <div class="summary-box">
              <div class="summary-text">
                <p>This article emphasizes the federal administration's "weaponizing" of food assistance and frames the situation as a political move, suggesting the main claims may be shaped by the alarm at the policy implications.</p>
              </div>
            </div>
          </div>

          <!-- Donors Container -->
          <div class="summary-container">
            <div class="summary-subtitle">Donors</div>
            <div class="summary-box">
              <div class="summary-text">
                <p>The article is based on official statements from the state's Department of Human Services and other government filings, and appears to draw on credible data and sources. No traces of lobbying, but the platform gets local donations (<$50 on average) through a local foundation setup.</p>
              </div>
            </div>
          </div>
        </div>
      `;
    },

    async updateHowToUse() {
      const howToUseEl = document.getElementById('trulens-how-to-use');
      if (!howToUseEl) return;
      
      // How to Use tab content
      howToUseEl.innerHTML = `
        <div class="how-to-use-container">
          <div class="how-to-use-content">
            <!-- Section 1: Scan any article -->
            <div class="how-to-use-section">
              <h3 class="how-to-use-heading">Scan any article</h3>
              <p class="how-to-use-description">Load the extension when you're reading through any sources that you want to fact-check or understand more deeply.</p>
              <div class="how-to-use-image-container">
                <img src="${chrome.runtime.getURL('images/scan-article-image.png')}" alt="Scan any article example" class="how-to-use-image">
              </div>
            </div>

            <!-- Section 2: View trusted references -->
            <div class="how-to-use-section">
              <h3 class="how-to-use-heading">View trusted references</h3>
              <p class="how-to-use-description">Trulens immediately surfaces credible sources related to the content so you can validate claims and explore additional context.</p>
              <div class="how-to-use-image-container">
                <img src="${chrome.runtime.getURL('images/view-references-image.png')}" alt="View trusted references example" class="how-to-use-image">
              </div>
            </div>

            <!-- Section 3: Highlight to reveal biases -->
            <div class="how-to-use-section">
              <h3 class="how-to-use-heading">Highlight to reveal biases</h3>
              <p class="how-to-use-description">Select any sentence or passage to see:
                <ul class="how-to-use-list">
                  <li>Potential biases</li>
                  <li>Supporting or contradicting articles from across the web</li>
                  <li>Key claims and how they compare to other sources</li>
                </ul>
              </p>
              <div class="how-to-use-image-container">
                <img src="${chrome.runtime.getURL('images/highlight-biases-image.png')}" alt="Highlight to reveal biases example" class="how-to-use-image">
              </div>
            </div>

            <!-- Section 4: Get a quick summary -->
            <div class="how-to-use-section">
              <h3 class="how-to-use-heading">Get a quick summary</h3>
              <p class="how-to-use-description">Open the Summary tab for a concise, 4-minute brief of the article—including any funding sources or donors (when available) that may influence the narrative.</p>
              <div class="how-to-use-image-container">
                <img src="${chrome.runtime.getURL('images/get-summary-image.png')}" alt="Get a quick summary example" class="how-to-use-image">
              </div>
            </div>
          </div>
        </div>
      `;
    },

    async updateHighlights() {
      const highlightsEl = document.getElementById('trulens-my-highlights');
      if (!highlightsEl) {
        return;
      }

      // Get saved highlights from storage
      let response;
      try {
        response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_HIGHLIGHTS' });
      } catch (e) {
        console.error('[Trulens] Error getting highlights:', e);
        response = { success: false, data: null };
      }

      const savedHighlights = (response && response.success && response.data) ? response.data : [];

      if (savedHighlights.length === 0) {
        highlightsEl.innerHTML = '<p style="color: var(--secondary-content, #797979); padding: 16px;">No highlights saved yet.</p>';
        return;
      }

      const getReliabilityIcon = (reliability) => {
        const icons = {
          'reliable': chrome.runtime.getURL('assets/lets-icons_check-fill.svg'),
          'less-reliable': chrome.runtime.getURL('assets/icon-park-solid_caution.svg'),
          'not-reliable': chrome.runtime.getURL('assets/solar_danger-bold.svg')
        };
        return icons[reliability] || '';
      };

      // Generate reliability (placeholder - replace with actual analysis)
      const getReliability = (highlight, index) => {
        // For now, use a simple rotation or default to 'reliable'
        // In the future, this should analyze the text for reliability
        const reliabilities = ['reliable', 'less-reliable', 'reliable'];
        return reliabilities[index % 3] || 'reliable';
      };

      // Generate rationale (placeholder - replace with actual analysis)
      const getRationale = (highlight) => {
        // For now, return empty array or placeholder rationale
        // In the future, this should analyze the text and provide rationale
        return [];
      };

      // Group highlights by source (domain)
      const highlightsBySource = {};
      savedHighlights.forEach((highlight, index) => {
        const url = highlight.url || '';
        let sourceName = 'Unknown';
        let domain = '';
        
        try {
          if (url) {
            domain = new URL(url).hostname.replace('www.', '');
            // Extract source name (e.g., "nj.com" -> "NJ.com", "wptv.com" -> "WPTV")
            const parts = domain.split('.');
            if (parts.length > 0) {
              const baseName = parts[0];
              // Capitalize appropriately
              if (baseName.length <= 4) {
                sourceName = baseName.toUpperCase();
              } else {
                sourceName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
              }
            } else {
              sourceName = domain;
            }
          }
        } catch (e) {
          sourceName = 'Unknown';
        }
        
        if (!highlightsBySource[sourceName]) {
          highlightsBySource[sourceName] = {
            domain: domain,
            highlights: []
          };
        }
        
        // Add highlight to the beginning of the array for this source (most recent first)
        highlightsBySource[sourceName].highlights.unshift({
          ...highlight,
          reliability: getReliability(highlight, index),
          rationale: getRationale(highlight)
        });
      });

      // Render highlights grouped by source with collapsible headers
      highlightsEl.innerHTML = `
        <div class="highlights-container">
          <div class="highlights-cards-list">
            ${Object.entries(highlightsBySource).map(([sourceName, sourceData]) => {
              const sourceId = `source-${sourceName.toLowerCase().replace(/\s+/g, '-')}`;
              const sourceHighlights = sourceData.highlights;
              
              return `
                <div class="highlight-source-group" data-source-id="${sourceId}">
                  <!-- Source Header (Collapsible) -->
                  <div class="highlight-source-header collapsed" data-source-header="${sourceId}">
                    <div class="highlight-radio">
                      <div class="highlight-radio-circle"></div>
          </div>
                    <div class="highlight-source-header-content">
                      <span class="highlight-source-name">${escapeHtml(sourceName)}</span>
                      <span class="highlight-source-title">${escapeHtml(sourceHighlights[0].title || 'Untitled')}</span>
        </div>
                    <button class="highlight-chevron" aria-label="Toggle source highlights">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                  </div>
                  
                  <!-- Source Highlights (Hidden when collapsed) -->
                  <div class="highlight-source-content" data-source-content="${sourceId}">
                    ${sourceHighlights.map((highlight, highlightIndex) => {
                      const reliability = highlight.reliability || 'reliable';
                      const reliabilityLabels = {
                        'reliable': 'Reliable',
                        'less-reliable': 'Less Reliable',
                        'not-reliable': 'Not Reliable'
                      };
                      const reliabilityIcon = getReliabilityIcon(reliability);
                      const quote = highlight.text || '';
                      const rationalePoints = highlight.rationale || [];
                      
                      return `
                        <div class="highlight-card-expanded" data-reliability="${reliability}">
                          <div class="highlight-reliability-badge ${reliability}">
                            ${reliabilityIcon ? `<img src="${reliabilityIcon}" alt="${reliabilityLabels[reliability]}" class="badge-icon">` : ''}
                            <span>${reliabilityLabels[reliability]}</span>
                          </div>
                          ${quote ? `<div class="highlight-quote">${escapeHtml(quote)}</div>` : ''}
                          ${rationalePoints.length > 0 ? `
                            <div class="highlight-rationale">
                              <ul class="highlight-rationale-list">
                                ${rationalePoints.map(point => `<li>${escapeHtml(point)}</li>`).join('')}
                              </ul>
                            </div>
                          ` : ''}
                          <a href="${highlight.url || '#'}" target="_blank" rel="noopener" class="highlight-explore-link">Explore this topic</a>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      // Helper function to toggle expand/collapse
      const toggleSource = (header) => {
        const sourceId = header.dataset.sourceHeader;
        const content = highlightsEl.querySelector(`[data-source-content="${sourceId}"]`);
        const chevron = header.querySelector('.highlight-chevron svg');
        
        if (content) {
          const isCollapsed = header.classList.contains('collapsed');
          
          if (isCollapsed) {
            header.classList.remove('collapsed');
            header.classList.add('expanded');
            content.style.display = 'flex';
            if (chevron) {
              chevron.style.transform = 'rotate(180deg)';
            }
          } else {
            header.classList.remove('expanded');
            header.classList.add('collapsed');
            content.style.display = 'none';
            if (chevron) {
              chevron.style.transform = 'rotate(0deg)';
            }
          }
        }
      };

      // Setup expand/collapse functionality for source headers
      highlightsEl.querySelectorAll('.highlight-source-header').forEach(header => {
        // Click on header to toggle
        header.addEventListener('click', (e) => {
          // Don't toggle if clicking the chevron button directly (it has its own handler)
          if (e.target.closest('.highlight-chevron')) {
            return;
          }
          toggleSource(header);
        });
        
        // Click on chevron button to toggle
        const chevronButton = header.querySelector('.highlight-chevron');
        if (chevronButton) {
          chevronButton.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSource(header);
          });
        }
        
        // Initialize chevron state
        const chevron = header.querySelector('.highlight-chevron svg');
        if (chevron && header.classList.contains('collapsed')) {
          chevron.style.transform = 'rotate(0deg)';
        }
      });
      
      // Initialize content visibility
      highlightsEl.querySelectorAll('.highlight-source-content').forEach(content => {
        content.style.display = 'none';
      });
    }
  };

  // Helper function to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Setup Sources Overview interactivity
  function setupSourcesInteractivity(sourcesEl, talkingPoints) {
    // Talking point click handlers
    const talkingPointItems = sourcesEl.querySelectorAll('.talking-point-item, .talking-point-item-row');
    talkingPointItems.forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('more-button')) {
          return;
        }
        const text = item.querySelector('.talking-point-text, .talking-point-item-row-text')?.textContent;
        if (text) {
          console.log('Talking point clicked:', text);
        }
      });
    });

    // "More" button handlers
    const moreButtons = sourcesEl.querySelectorAll('.more-button');
    moreButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(button.dataset.pointIndex);
        const point = talkingPoints[index];
        if (point) {
          console.log('Expanding:', point);
        }
      });
    });

    // Source card click handlers
    const sourceCards = sourcesEl.querySelectorAll('.source-card');
    sourceCards.forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
          return;
        }
        const title = card.querySelector('.source-title')?.textContent;
        if (title) {
          console.log('Source card clicked:', title);
        }
      });
    });

    // Filter button handler
    const filterButton = sourcesEl.querySelector('.filter-icon-button');
    if (filterButton) {
      filterButton.addEventListener('click', () => {
        console.log('Filter button clicked');
      });
    }
  }

  // ============================================================================
  // Highlights Toggle
  // ============================================================================

  async function toggleHighlights(enabled) {
    const blocks = visibleParagraphs();
    for (const block of blocks) {
      if (enabled) {
        block.classList.add('trulens-highlight');
      } else {
        block.classList.remove('trulens-highlight');
      }
    }
  }

  // ============================================================================
  // Main Initialization
  // ============================================================================

  let scanDebounce = null;
  let currentAnalysis = null;

  async function scanPage() {
    clearTimeout(scanDebounce);
    scanDebounce = setTimeout(async () => {
      const blocks = visibleParagraphs();
      if (blocks.length === 0) return;

      currentAnalysis = await pageDecision(blocks);
      
      if (!currentAnalysis || typeof currentAnalysis !== 'object') {
        currentAnalysis = {
          label: 'Unknown',
          confidence: 'tentative',
          reasons: ['No readable content'],
          score: 0
        };
      }

      // Guarantee label exists
      if (!currentAnalysis.label || typeof currentAnalysis.label !== 'string') {
        currentAnalysis.label = 'Unknown';
      }
      
      try {
        await chrome.runtime.sendMessage({
          type: 'TRULENS_SAVE',
          payload: {
            url: window.location.href,
            ts: Date.now(),
            overall: currentAnalysis.label,
            reasons: currentAnalysis.reasons,
            confidence: currentAnalysis.confidence,
            score: currentAnalysis.score
          }
        });
      } catch (error) {
        // Extension context invalidated or other runtime errors - continue silently
      }

    }, 300);
  }

  // Initialize UI
  injectUI();

  // Initialize managers
  const bubbleManager = new BubbleManager();
  const selectionWatcher = new SelectionWatcher();

  // Auto-open panel when extension loads
  panel.show();

  // Initial scan
  scanPage();

  // SPA watch (pushState/popState + DOM mutations)
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      scanPage();
      bubbleManager.stop();
      bubbleManager.start();
    }
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener('popstate', () => {
    scanPage();
    bubbleManager.stop();
    setTimeout(() => bubbleManager.start(), 100);
  });

  // Override pushState/replaceState
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    setTimeout(() => {
      scanPage();
      bubbleManager.stop();
      setTimeout(() => bubbleManager.start(), 100);
    }, 100);
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    setTimeout(() => {
      scanPage();
      bubbleManager.stop();
      setTimeout(() => bubbleManager.start(), 100);
    }, 100);
  };

  // Listen for settings changes
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TRULENS_SETTINGS_UPDATED') {
      bubbleManager.updateSettings();
      selectionWatcher.updateSettings();
      
      chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' }).then(response => {
        const settings = response.data || {};
        if (settings.highlights !== undefined) {
          toggleHighlights(settings.highlights);
        }
        if (settings.quietMode) {
          panel.hide();
        }
      }).catch(e => {
        // Extension context invalidated - continue silently
      });
    }

    if (message.type === 'TRULENS_REQUEST_SCAN') {
      scanPage();
    }

    if (message.type === 'TRULENS_REQUEST_PERSPECTIVE') {
      panel.updateReferences();
    }

    if (message.type === 'TRULENS_OPEN_PANEL') {
      panel.show();
    }

    if (message.type === 'TRULENS_TOGGLE_HIGHLIGHTS') {
      chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' }).then(response => {
        const settings = response.data || {};
        const newValue = !settings.highlights;
        chrome.runtime.sendMessage({
          type: 'TRULENS_SET_SETTINGS',
          settings: { ...settings, highlights: newValue }
        }).then(() => {
          toggleHighlights(newValue);
        }).catch(e => {
          // Extension context invalidated - continue silently
        });
      }).catch(e => {
        // Extension context invalidated - continue silently
      });
    }
  });

  // Panel tab listeners (legacy - using new tab-button class now)
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-button')) {
      const tabName = e.target.dataset.tab;
      if (tabName === 'references') {
        panel.updateReferences();
      } else if (tabName === 'summary') {
        panel.updateSummary();
      } else if (tabName === 'how-to-use') {
        panel.updateHowToUse();
      } else if (tabName === 'my-highlights') {
        panel.updateHighlights();
      }
    }
  });

  // ============================================================================
  // Margin Bubble API (for testing and future use)
  // ============================================================================

  // Expose MarginBubbleManager API to content script scope
  const { createMarginBubble, removeMarginBubble, clearAllMarginBubbles } = 
    window.MarginBubbleManager || {};

  // Test function: Add a bubble to the first paragraph
  function testMarginBubble() {
    const firstP = document.querySelector('p');
    if (firstP && createMarginBubble) {
      createMarginBubble({
        anchorNode: firstP,
        message: "What assumptions is the author making here?"
      });
    }
  }

  // Uncomment the line below to test margin bubbles on page load
  // setTimeout(testMarginBubble, 1000);

})();


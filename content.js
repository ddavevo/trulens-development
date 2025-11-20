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
    // Badge
    if (!document.getElementById('trulens-badge')) {
      const badge = document.createElement('div');
      badge.id = 'trulens-badge';
      badge.className = 'trulens-badge';
      badge.setAttribute('role', 'button');
      badge.setAttribute('aria-label', 'TruLens analysis badge');
      badge.setAttribute('tabindex', '0');
      badge.innerHTML = `
        <span class="trulens-badge-chip">Analyzing...</span>
        <span class="trulens-badge-sublabel">confidence: steady</span>
      `;
      document.body.appendChild(badge);
      badge.addEventListener('click', () => panel.toggle());
      badge.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          panel.toggle();
        }
      });
    }

    // Panel
    if (!document.getElementById('trulens-panel')) {
      const panelEl = document.createElement('div');
      panelEl.id = 'trulens-panel';
      panelEl.className = 'trulens-panel';
      panelEl.setAttribute('role', 'dialog');
      panelEl.setAttribute('aria-label', 'TruLens analysis panel');
      panelEl.innerHTML = `
        <div class="trulens-panel-header">
          <div class="trulens-panel-title">TruLens</div>
          <button class="trulens-panel-close" aria-label="Close panel">×</button>
        </div>
        <div class="trulens-panel-tabs">
          <button class="trulens-panel-tab active" data-tab="overview">Overview</button>
          <button class="trulens-panel-tab" data-tab="sources">Sources</button>
          <button class="trulens-panel-tab" data-tab="bubbles">Bubbles</button>
          <button class="trulens-panel-tab" data-tab="highlights">My Highlights</button>
        </div>
        <div class="trulens-panel-content">
          <div class="trulens-panel-section active" id="trulens-overview"></div>
          <div class="trulens-panel-section" id="trulens-sources"></div>
          <div class="trulens-panel-section" id="trulens-bubbles"></div>
          <div class="trulens-panel-section" id="trulens-highlights"></div>
        </div>
      `;
      document.body.appendChild(panelEl);
      
      // Tab switching
      panelEl.querySelectorAll('.trulens-panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const tabName = tab.dataset.tab;
          panelEl.querySelectorAll('.trulens-panel-tab').forEach(t => t.classList.remove('active'));
          panelEl.querySelectorAll('.trulens-panel-section').forEach(s => s.classList.remove('active'));
          tab.classList.add('active');
          document.getElementById(`trulens-${tabName}`).classList.add('active');
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
    const response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' });
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
      const response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' });
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
      const response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' });
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
      const response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' });
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
        document.getElementById('trulens-toolbar-container').appendChild(this.toolbar);
      }

      // Analyze selection
      const metrics = metricsFor(text);
      const topic = text.substring(0, 30) + (text.length > 30 ? '...' : '');
      const angle = metrics.opinion > 0 ? 'Opinion-leaning' : 'Reporting';

      this.toolbar.innerHTML = `
        <span class="trulens-toolbar-chip">Topic: ${topic}</span>
        <span class="trulens-toolbar-chip">Angle: ${angle}</span>
        <button class="trulens-toolbar-button" data-action="check">Check claim</button>
        <button class="trulens-toolbar-button" data-action="coverage">Other coverage</button>
        <button class="trulens-toolbar-button" data-action="save">Save</button>
      `;

      // Position above selection
      const toolbarRect = this.toolbar.getBoundingClientRect();
      const left = rect.left + (rect.width / 2) - (toolbarRect.width / 2);
      const top = rect.top - toolbarRect.height - 8;

      this.toolbar.style.left = `${Math.max(8, left)}px`;
      this.toolbar.style.top = `${Math.max(8, top)}px`;
      this.toolbar.style.display = 'flex';

      // Action handlers
      this.toolbar.querySelectorAll('.trulens-toolbar-button').forEach(btn => {
        btn.addEventListener('click', async () => {
          await this.handleAction(btn.dataset.action, text);
        });
        btn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            btn.click();
          }
        });
      });

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
      if (action === 'check') {
        const query = encodeURIComponent(`"${text.substring(0, 100)}"`);
        window.open(`https://www.google.com/search?q=${query}`, '_blank');
      } else if (action === 'coverage') {
        const topic = topTopic(text);
        const links = await buildPerspectiveLinks(topic);
        for (const link of links.slice(0, 5)) {
          window.open(link.url, '_blank');
        }
      } else if (action === 'save') {
        const excerpt = {
          text: text.substring(0, 500),
          url: window.location.href,
          timestamp: Date.now(),
          title: document.title
        };
        
        const response = await chrome.runtime.sendMessage({ 
          type: 'TRULENS_GET_HIGHLIGHTS' 
        });
        const highlights = response.data || [];
        highlights.unshift(excerpt);
        
        await chrome.runtime.sendMessage({
          type: 'TRULENS_SET_HIGHLIGHTS',
          highlights: highlights.slice(0, 100) // Keep last 100
        });

        this.hideToolbar();
      }
    }

    hideToolbar() {
      if (this.toolbar) {
        this.toolbar.style.display = 'none';
      }
    }

    async updateSettings() {
      const response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' });
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
        this.updateOverview();
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
      const response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_LATEST' });
      let decision = response.data;

      if (!decision || decision.url !== window.location.href) {
        // Scan now
        const blocks = visibleParagraphs();
        decision = await pageDecision(blocks);
        
        // Save
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
      }

      if (!decision || typeof decision.label !== 'string') {
        overviewEl.innerHTML = `
          <div class="trulens-overview-label">Unknown</div>
          <div class="trulens-overview-confidence">confidence: tentative</div>
          <ul class="trulens-reasons">
            <li>No analysis available yet.</li>
          </ul>
        `;
        return;
      }

      const label = decision.label || 'Unknown';
      const labelClass =
        label.includes('AI') ? 'ai' :
        label.includes('Mixed') ? 'mixed' :
        'human';

      overviewEl.innerHTML = `
        <div class="trulens-overview-label">${decision.label}</div>
        <div class="trulens-overview-confidence">confidence: ${decision.confidence}</div>
        <ul class="trulens-reasons">
          ${decision.reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
        <button class="trulens-show-details">Show details</button>
        <div class="trulens-details">
          Score: ${Math.round(decision.score)}/100
        </div>
      `;

      overviewEl.querySelector('.trulens-show-details').addEventListener('click', (e) => {
        const details = overviewEl.querySelector('.trulens-details');
        details.classList.toggle('visible');
        e.target.textContent = details.classList.contains('visible') ? 'Hide details' : 'Show details';
      });

      // Update badge
      const badge = document.getElementById('trulens-badge');
      if (badge) {
        const chip = badge.querySelector('.trulens-badge-chip');
        chip.textContent = decision.label;
        chip.className = `trulens-badge-chip ${labelClass}`;
        badge.querySelector('.trulens-badge-sublabel').textContent = `confidence: ${decision.confidence}`;
      }
    },

    async updateSources() {
      const sourcesEl = document.getElementById('trulens-sources');
      if (!sourcesEl) return;

      const blocks = visibleParagraphs();
      const text = blocks.map(b => b.textContent).join(' ').trim();
      const topic = topTopic(text);
      const links = await buildPerspectiveLinks(topic);

      // Group by category
      const grouped = {};
      for (const link of links) {
        if (!grouped[link.group]) {
          grouped[link.group] = [];
        }
        grouped[link.group].push(link);
      }

      sourcesEl.innerHTML = Object.entries(grouped).map(([group, groupLinks]) => `
        <div class="trulens-source-group">
          <div class="trulens-source-group-title">${group}</div>
          <div class="trulens-source-links">
            ${groupLinks.map(link => `
              <a href="${link.url}" target="_blank" rel="noopener" class="trulens-source-link">
                ${link.domain}
              </a>
            `).join('')}
          </div>
        </div>
      `).join('');
    },

    async updateHighlights() {
      const highlightsEl = document.getElementById('trulens-highlights');
      if (!highlightsEl) return;

      const response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_HIGHLIGHTS' });
      const highlights = response.data || [];

      if (highlights.length === 0) {
        highlightsEl.innerHTML = '<p style="color: var(--text-muted);">No highlights saved yet.</p>';
        return;
      }

      highlightsEl.innerHTML = highlights.map(h => `
        <div style="padding: 12px; background: var(--bg-primary); border-radius: var(--radius-card); margin-bottom: 12px;">
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
            ${new Date(h.timestamp).toLocaleString()}
          </div>
          <div style="font-size: 13px; margin-bottom: 8px;">${h.text}</div>
          <a href="${h.url}" target="_blank" rel="noopener" style="font-size: 11px; color: var(--accent);">
            ${h.title || h.url}
          </a>
        </div>
      `).join('');
    }
  };

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

      // Update badge if visible
      const badge = document.getElementById('trulens-badge');
      if (badge && currentAnalysis && typeof currentAnalysis.label === 'string') {
        const chip = badge.querySelector('.trulens-badge-chip');
        const label = currentAnalysis.label || 'Unknown';
        chip.textContent = label;
        const labelClass =
          label.includes('AI') ? 'ai' :
          label.includes('Mixed') ? 'mixed' :
          'human';
        chip.className = `trulens-badge-chip ${labelClass}`;
        badge.querySelector('.trulens-badge-sublabel').textContent = `confidence: ${currentAnalysis.confidence || 'tentative'}`;
      }
    }, 300);
  }

  // Initialize UI
  injectUI();

  // Initialize managers
  const bubbleManager = new BubbleManager();
  const selectionWatcher = new SelectionWatcher();

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
      });
    }

    if (message.type === 'TRULENS_REQUEST_SCAN') {
      scanPage();
    }

    if (message.type === 'TRULENS_REQUEST_PERSPECTIVE') {
      panel.updateSources();
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
        });
      });
    }
  });

  // Panel tab listeners
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('trulens-panel-tab')) {
      const tabName = e.target.dataset.tab;
      if (tabName === 'sources') {
        panel.updateSources();
      } else if (tabName === 'highlights') {
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


// Margin Bubble Manager
// Handles floating margin bubbles with Shadow DOM encapsulation

(function() {
  'use strict';

  // Constants
  const BUBBLE_WIDTH = 260;
  const BUBBLE_MARGIN = 24;
  const BUBBLE_SPACING = 12;
  const MOBILE_BREAKPOINT = 768;
  const MIN_MARGIN_WIDTH = 300;

  // Global state
  const bubbles = new Map(); // id -> bubble data
  let bubbleLayer = null;
  let repositionRaf = null;
  let scrollHandler = null;
  let resizeHandler = null;
  let mutationObserver = null;

  // CSS for Shadow DOM
  const bubbleStyles = `
    <style>
      :host {
        display: block;
        position: absolute;
        z-index: 999999;
        pointer-events: auto;
        max-width: ${BUBBLE_WIDTH}px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 13px;
        line-height: 1.5;
        animation: trulens-bubble-fade-in 0.3s ease-out;
      }

      @keyframes trulens-bubble-fade-in {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .bubble-container {
        background: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        padding: 12px 14px;
        position: relative;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      .bubble-message {
        color: #333333;
        margin: 0;
        padding-right: 20px;
      }

      .bubble-close {
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        font-size: 20px;
        line-height: 1;
        color: #999999;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: background-color 0.2s, color 0.2s;
      }

      .bubble-close:hover {
        background-color: #f0f0f0;
        color: #666666;
      }

      .bubble-close:active {
        background-color: #e0e0e0;
      }

      .bubble-arrow {
        position: absolute;
        left: -8px;
        top: 16px;
        width: 0;
        height: 0;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        border-right: 8px solid #e0e0e0;
      }

      .bubble-arrow::after {
        content: '';
        position: absolute;
        left: 1px;
        top: -8px;
        width: 0;
        height: 0;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        border-right: 8px solid #ffffff;
      }

      @media (prefers-reduced-motion: reduce) {
        :host {
          animation: none;
        }
      }
    </style>
  `;

  // Initialize bubble layer
  function ensureBubbleLayer() {
    if (!bubbleLayer) {
      bubbleLayer = document.getElementById('trulens-margin-bubble-layer');
      if (!bubbleLayer) {
        bubbleLayer = document.createElement('div');
        bubbleLayer.id = 'trulens-margin-bubble-layer';
        bubbleLayer.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 999998;
          overflow: visible;
        `;
        document.body.appendChild(bubbleLayer);
      }
    }
    return bubbleLayer;
  }

  // Check if element is visible
  function isElementVisible(element) {
    if (!element || !document.body.contains(element)) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      style.opacity !== '0'
    );
  }

  // Detect fixed side panels
  function detectFixedPanels() {
    const fixedElements = [];
    const allElements = document.querySelectorAll('*');
    
    for (const el of allElements) {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        const rect = el.getBoundingClientRect();
        // Check if it's on the right side
        if (rect.right > window.innerWidth * 0.7) {
          fixedElements.push({
            element: el,
            right: rect.right,
            left: rect.left,
            width: rect.width
          });
        }
      }
    }
    
    return fixedElements;
  }

  // Calculate bubble position
  function calculatePosition(anchorNode, bubbleHeight) {
    if (!isElementVisible(anchorNode)) {
      return null;
    }

    const rect = anchorNode.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Check if mobile or narrow viewport
    const isMobile = viewportWidth < MOBILE_BREAKPOINT;
    const availableMargin = viewportWidth - rect.right;

    let left, top;

    if (isMobile || availableMargin < MIN_MARGIN_WIDTH) {
      // Dock to bottom-right on mobile
      left = viewportWidth - BUBBLE_WIDTH - BUBBLE_MARGIN;
      top = viewportHeight - bubbleHeight - BUBBLE_MARGIN;
    } else {
      // Position in right margin
      left = viewportWidth - BUBBLE_WIDTH - BUBBLE_MARGIN;
      top = rect.top + scrollY;
    }

    // Check for fixed panels
    const fixedPanels = detectFixedPanels();
    for (const panel of fixedPanels) {
      if (left < panel.right && left + BUBBLE_WIDTH > panel.left) {
        // Shift left to avoid panel
        left = panel.left - BUBBLE_WIDTH - BUBBLE_MARGIN;
        if (left < BUBBLE_MARGIN) {
          // Not enough space, dock to bottom
          left = viewportWidth - BUBBLE_WIDTH - BUBBLE_MARGIN;
          top = viewportHeight - bubbleHeight - BUBBLE_MARGIN;
        }
      }
    }

    // Ensure bubble stays within viewport
    left = Math.max(BUBBLE_MARGIN, Math.min(left, viewportWidth - BUBBLE_WIDTH - BUBBLE_MARGIN));
    top = Math.max(BUBBLE_MARGIN, Math.min(top, viewportHeight + scrollY - bubbleHeight - BUBBLE_MARGIN));

    return { left, top };
  }

  // Stack bubbles to avoid overlap
  function stackBubbles() {
    const sortedBubbles = Array.from(bubbles.values())
      .filter(b => b.shadowHost && isElementVisible(b.anchorNode))
      .sort((a, b) => {
        const rectA = a.anchorNode.getBoundingClientRect();
        const rectB = b.anchorNode.getBoundingClientRect();
        return rectA.top - rectB.top;
      });

    if (sortedBubbles.length === 0) {
      return;
    }

    let currentTop = null;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY;
    const isMobile = viewportWidth < MOBILE_BREAKPOINT;

    for (const bubble of sortedBubbles) {
      if (!bubble.shadowHost || !isElementVisible(bubble.anchorNode)) {
        continue;
      }

      const rect = bubble.anchorNode.getBoundingClientRect();
      const bubbleHeight = bubble.shadowHost.offsetHeight || 100; // Fallback height

      // Calculate base position
      const position = calculatePosition(bubble.anchorNode, bubbleHeight);
      if (!position) {
        continue;
      }

      let targetTop = position.top;

      // If mobile, all bubbles stack at bottom
      if (isMobile) {
        if (currentTop === null) {
          currentTop = viewportHeight + scrollY - bubbleHeight - BUBBLE_MARGIN;
        } else {
          currentTop = currentTop - bubbleHeight - BUBBLE_SPACING;
        }
        targetTop = Math.max(BUBBLE_MARGIN, currentTop);
      } else {
        // Stack vertically if overlapping
        if (currentTop !== null && targetTop < currentTop + bubbleHeight + BUBBLE_SPACING) {
          targetTop = currentTop + bubbleHeight + BUBBLE_SPACING;
        }
        // Ensure bubble stays within viewport
        targetTop = Math.max(BUBBLE_MARGIN, Math.min(targetTop, viewportHeight + scrollY - bubbleHeight - BUBBLE_MARGIN));
        currentTop = targetTop;
      }

      bubble.shadowHost.style.left = `${position.left}px`;
      bubble.shadowHost.style.top = `${targetTop}px`;
    }
  }

  // Reposition all bubbles
  function repositionBubbles() {
    if (repositionRaf) {
      cancelAnimationFrame(repositionRaf);
    }

    repositionRaf = requestAnimationFrame(() => {
      // First, hide bubbles with invisible anchors
      for (const [id, bubble] of bubbles.entries()) {
        if (!bubble.shadowHost || !isElementVisible(bubble.anchorNode)) {
          if (bubble.shadowHost) {
            bubble.shadowHost.style.display = 'none';
          }
        } else if (bubble.shadowHost) {
          bubble.shadowHost.style.display = 'block';
        }
      }

      // Then stack all visible bubbles (stacking handles positioning)
      stackBubbles();
      repositionRaf = null;
    });
  }

  // Setup event listeners
  function setupEventListeners() {
    if (scrollHandler) return; // Already set up

    scrollHandler = () => {
      repositionBubbles();
    };

    resizeHandler = () => {
      repositionBubbles();
    };

    window.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('resize', resizeHandler, { passive: true });

    // Watch for DOM changes that might affect anchor elements
    mutationObserver = new MutationObserver(() => {
      repositionBubbles();
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }

  // Cleanup event listeners
  function cleanupEventListeners() {
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (repositionRaf) {
      cancelAnimationFrame(repositionRaf);
      repositionRaf = null;
    }
  }

  // Create a bubble
  function createMarginBubble({ anchorNode, message, id }) {
    if (!anchorNode || !message) {
      console.warn('MarginBubbleManager: anchorNode and message are required');
      return null;
    }

    if (!isElementVisible(anchorNode)) {
      console.warn('MarginBubbleManager: anchorNode is not visible');
      return null;
    }

    const bubbleId = id || `trulens-margin-bubble-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (bubbles.has(bubbleId)) {
      console.warn(`MarginBubbleManager: Bubble with id ${bubbleId} already exists`);
      return bubbleId;
    }

    // Ensure layer exists
    ensureBubbleLayer();
    setupEventListeners();

    // Create shadow host
    const shadowHost = document.createElement('div');
    shadowHost.className = 'trulens-margin-bubble-host';
    
    // Create shadow root
    const shadowRoot = shadowHost.attachShadow({ mode: 'closed' });
    
    // Create bubble HTML
    shadowRoot.innerHTML = `
      ${bubbleStyles}
      <div class="bubble-container">
        <div class="bubble-arrow"></div>
        <div class="bubble-message">${escapeHtml(message)}</div>
        <button class="bubble-close" aria-label="Close bubble" title="Close">×</button>
      </div>
    `;

    // Get close button
    const closeButton = shadowRoot.querySelector('.bubble-close');
    closeButton.addEventListener('click', () => {
      removeMarginBubble(bubbleId);
    });

    // Store bubble data
    bubbles.set(bubbleId, {
      id: bubbleId,
      anchorNode,
      message,
      shadowHost,
      shadowRoot
    });

    // Add to layer
    bubbleLayer.appendChild(shadowHost);

    // Initial positioning
    requestAnimationFrame(() => {
      repositionBubbles();
    });

    return bubbleId;
  }

  // Remove a bubble
  function removeMarginBubble(id) {
    const bubble = bubbles.get(id);
    if (!bubble) {
      return false;
    }

    if (bubble.shadowHost && bubble.shadowHost.parentNode) {
      bubble.shadowHost.parentNode.removeChild(bubble.shadowHost);
    }

    bubbles.delete(id);

    // Reposition remaining bubbles
    repositionBubbles();

    // Cleanup if no bubbles left
    if (bubbles.size === 0) {
      cleanupEventListeners();
    }

    return true;
  }

  // Clear all bubbles
  function clearAllMarginBubbles() {
    const ids = Array.from(bubbles.keys());
    for (const id of ids) {
      removeMarginBubble(id);
    }
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Public API
  window.MarginBubbleManager = {
    createMarginBubble,
    removeMarginBubble,
    clearAllMarginBubbles
  };

})();


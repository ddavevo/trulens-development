// Sources Overview JavaScript
// Handles interactivity and dynamic content insertion

(function() {
  'use strict';

  // Data structures (in a real app, this would come from an API)
  const warningData = {
    label: 'Less Reliable',
    text: 'While the facts are largely consistent with other sources, based on previous instances and reasons, reasons, there may be sway.',
    icon: 'assets/icon-park-solid_caution.svg' // Placeholder path
  };

  const talkingPoints = [
    { percentage: 46, text: 'Documented history with Epstein' },
    { percentage: 22, text: 'Redactions' },
    { percentage: 13, text: 'Ongoing lawsuits' },
    { percentage: 19, text: 'Activity on social media, other topic, other topic, other topic, other topic...', hasMore: true }
  ];

  const sourceCards = [
    {
      quote: '"West\'s much-publicized feud with Summers began shortly after Summers\' arrival to Cambridge in 2001. Per West\'s account, chronicled in his 2004 book "Democracy Matters"..."',
      title: 'Two decades later, Cornel West\'s critique of Larry Summers hits differently',
      publisher: {
        name: 'POLITICO',
        avatarColor: '#e02424'
      },
      reliability: 'reliable',
      reliabilityIcon: 'assets/lets-icons_check-fill.svg'
    },
    {
      quote: '"West\'s much-publicized feud with Summers began shortly after Summers\' arrival to Cambridge in 2001. Per West\'s account, chronicled in his 2004 book "Democracy Matters"..."',
      title: 'Two decades later, Cornel West\'s critique of Larry Summers hits differently',
      publisher: {
        name: 'POLITICO',
        avatarColor: '#e02424'
      },
      reliability: 'less-reliable',
      reliabilityIcon: 'assets/icon-park-solid_caution.svg'
    },
    {
      quote: '"West\'s much-publicized feud with Summers began shortly after Summers\' arrival to Cambridge in 2001. Per West\'s account, chronicled in his 2004 book "Democracy Matters"..."',
      title: 'Two decades later, Cornel West\'s critique of Larry Summers hits differently',
      publisher: {
        name: 'POLITICO',
        avatarColor: '#e02424'
      },
      reliability: 'not-reliable',
      reliabilityIcon: 'assets/solar_danger_bold.svg'
    }
  ];

  // Initialize on DOM ready
  function init() {
    renderWarningBox();
    renderTalkingPoints();
    renderSourceCards();
    setupTabNavigation();
    setupInteractivity();
  }

  // Render warning box
  function renderWarningBox() {
    const warningBox = document.getElementById('warning-box');
    if (!warningBox) return;

    warningBox.innerHTML = `
      <div class="warning-box-header">
        ${warningData.icon ? `<img src="${warningData.icon}" alt="Caution" class="warning-icon">` : ''}
        <span class="warning-label">${escapeHtml(warningData.label)}</span>
      </div>
      <p class="warning-text">${escapeHtml(warningData.text)}</p>
    `;
  }

  // Render talking points
  function renderTalkingPoints() {
    const container = document.getElementById('talking-points-list');
    if (!container) return;

    container.innerHTML = talkingPoints.map((point, index) => {
      if (point.hasMore) {
        return `
          <div class="talking-point-item-row">
            <span class="talking-point-item-row-text">${point.percentage}% - ${escapeHtml(point.text)}</span>
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
    }).join('');
  }

  // Render source cards
  function renderSourceCards() {
    const container = document.getElementById('source-cards-list');
    if (!container) return;

    container.innerHTML = sourceCards.map(card => {
      const reliabilityLabels = {
        'reliable': 'Reliable',
        'less-reliable': 'Less Reliable',
        'not-reliable': 'Not Reliable'
      };

      return `
        <div class="source-card" data-reliability="${card.reliability}">
          <p class="source-quote">${escapeHtml(card.quote)}</p>
          <div class="source-meta">
            <a href="#" class="source-title">${escapeHtml(card.title)}</a>
            <div class="source-footer">
              <div class="source-publisher">
                <div class="publisher-avatar" style="background-color: ${card.publisher.avatarColor}"></div>
                <span class="publisher-name">${escapeHtml(card.publisher.name)}</span>
              </div>
              <div class="reliability-badge ${card.reliability}">
                ${card.reliabilityIcon ? `<img src="${card.reliabilityIcon}" alt="${reliabilityLabels[card.reliability]}" class="badge-icon">` : ''}
                <span>${reliabilityLabels[card.reliability]}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Setup tab navigation
  function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Remove active class from all tabs
        tabButtons.forEach(btn => btn.classList.remove('active'));
        
        // Add active class to clicked tab
        button.classList.add('active');
        
        // Handle tab switching logic here
        const tabName = button.dataset.tab;
        handleTabSwitch(tabName);
      });

      // Keyboard navigation
      button.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          button.click();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const tabs = Array.from(tabButtons);
          const currentIndex = tabs.indexOf(button);
          const nextIndex = e.key === 'ArrowLeft' 
            ? (currentIndex - 1 + tabs.length) % tabs.length
            : (currentIndex + 1) % tabs.length;
          tabs[nextIndex].focus();
        }
      });
    });
  }

  // Handle tab switching
  function handleTabSwitch(tabName) {
    // In a real application, this would load different content
    // For now, we'll just log the switch
    console.log(`Switched to ${tabName} tab`);
    
    // You could add logic here to show/hide different sections
    // or load different data based on the selected tab
  }

  // Setup interactivity
  function setupInteractivity() {
    // Talking point click handlers
    const talkingPointItems = document.querySelectorAll('.talking-point-item, .talking-point-item-row');
    talkingPointItems.forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't trigger if clicking the "More" button
        if (e.target.classList.contains('more-button')) {
          return;
        }
        
        const text = item.querySelector('.talking-point-text, .talking-point-item-row-text')?.textContent;
        if (text) {
          handleTalkingPointClick(text);
        }
      });
    });

    // "More" button handlers
    const moreButtons = document.querySelectorAll('.more-button');
    moreButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(button.dataset.pointIndex);
        handleMoreClick(index);
      });
    });

    // Source card click handlers
    const sourceCards = document.querySelectorAll('.source-card');
    sourceCards.forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't trigger if clicking a link
        if (e.target.tagName === 'A') {
          return;
        }
        
        const title = card.querySelector('.source-title')?.textContent;
        if (title) {
          handleSourceCardClick(title, card.dataset.reliability);
        }
      });
    });

    // Filter button handler
    const filterButton = document.querySelector('.filter-icon-button');
    if (filterButton) {
      filterButton.addEventListener('click', () => {
        handleFilterClick();
      });
    }
  }

  // Event handlers
  function handleTalkingPointClick(text) {
    console.log('Talking point clicked:', text);
    // In a real app, this would navigate to a detail view or expand the item
  }

  function handleMoreClick(index) {
    console.log('More button clicked for point:', index);
    // In a real app, this would expand to show more details
    const point = talkingPoints[index];
    if (point) {
      alert(`Expanding: ${point.percentage}% - ${point.text}`);
    }
  }

  function handleSourceCardClick(title, reliability) {
    console.log('Source card clicked:', title, reliability);
    // In a real app, this would open the article or show more details
  }

  function handleFilterClick() {
    console.log('Filter button clicked');
    // In a real app, this would open a filter menu
    alert('Filter options would appear here');
  }

  // Utility function to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export functions for external use if needed
  window.SourcesOverview = {
    updateWarning: (data) => {
      warningData.label = data.label;
      warningData.text = data.text;
      warningData.icon = data.icon;
      renderWarningBox();
    },
    updateTalkingPoints: (points) => {
      talkingPoints.length = 0;
      talkingPoints.push(...points);
      renderTalkingPoints();
      setupInteractivity();
    },
    updateSourceCards: (cards) => {
      sourceCards.length = 0;
      sourceCards.push(...cards);
      renderSourceCards();
      setupInteractivity();
    }
  };

})();


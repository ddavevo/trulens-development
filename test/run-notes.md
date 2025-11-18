# TruLens MVP - Test Plan & Run Notes

## Quick Acceptance Tests

### Test 1: Badge Appears
1. Navigate to https://apnews.com
2. Look for blue "TruLens" badge in bottom-right corner
**Expected**: Badge visible ✓

### Test 2: Panel Opens
1. Click the TruLens badge
**Expected**: Panel slides in from right with UI ✓

### Test 3: Scan Works
1. Click "Scan" button in panel
**Expected**: 
- Three scores appear (AI%, Pol%, Bias%)
- Color highlights on page
- Perspective links populate ✓

### Test 4: Highlights Toggle
1. After scan, uncheck "AI highlights" 
2. Re-check it
**Expected**: Yellow highlights hide/show ✓

### Test 5: Clear Function
1. Click "Clear" button
**Expected**: All highlights removed, scores reset ✓

### Test 6: Perspective Links
1. After scan, check Perspective Check section
2. Click a link
**Expected**: 4-8 diverse links, opens in new tab ✓

### Test 7: Popup Shows Data
1. Click TruLens extension icon in toolbar
**Expected**: Last scan results displayed ✓

### Test 8: Export JSON
1. From popup, click "Export JSON"
**Expected**: Download trulens-result.json ✓

### Test 9: Multiple Sites
Test on:
- [ ] https://apnews.com
- [ ] https://reuters.com
- [ ] https://bbc.com/news
- [ ] https://cnn.com
- [ ] https://foxnews.com

### Test 10: Sample Article
1. Open `test/heuristics.sample.html`
2. Click badge, scan
**Expected**: 
- AI: 40-60%
- Pol: 50-70%
- Bias: 60-80%
- Multiple colored highlights ✓

## Demo Script (2 minutes)

1. Navigate to news article
2. "Here's TruLens - click the badge"
3. "Click Scan - instant analysis"
4. "Three scores: AI-like, Polarization, Bias"
5. "Color-coded highlights throughout"
6. "Perspective Check shows opposing viewpoints"
7. "Toggle highlights on/off"
8. "100% privacy-first - all local processing"
9. "Export data as JSON"
10. "Works on any news site"

## Known Limitations

- English language only
- Heuristics are signals, not ground truth
- May flag quotes/satire appropriately
- Complex sites may vary in extraction quality

## Success Criteria

✓ Badge injection works
✓ Panel UI functional
✓ Scores compute accurately
✓ Highlights apply correctly
✓ Toggles work
✓ Perspective links diverse
✓ Popup displays data
✓ Export JSON works
✓ No console errors
✓ Privacy preserved

---

**Version**: 0.1.0
**Last Updated**: 2025-10-29

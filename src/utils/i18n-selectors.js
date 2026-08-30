/**
 * Multi-language (i18n) & Semantic Selector Engine for Google Flow.
 * Ensures reliable UI interaction regardless of user language setting or Google A/B testing.
 */

export const I18nSelectors = {
  // Add to prompt button patterns
  addToPrompt: [
    'button:has-text("프롬프트에 추가")',
    'button:has-text("프롬프트에 삽입")',
    'button:has-text("Add to prompt")',
    'button:has-text("Add to Prompt")',
    'button:has-text("Insert into prompt")',
    'button:has-text("プロンプトに追加")',
    'button:has-text("Ajouter au prompt")',
    'button:has-text("Añadir al prompt")',
    'button[aria-label*="prompt" i]',
    'button[aria-label*="추가" i]',
    'button:has-text("추가")',
    'button:has-text("Add")'
  ],

  // Generate / Submit button patterns
  generateButton: [
    'button:has(:text-is("arrow_forward"))',
    'button:has(:text-is("send"))',
    'button:has(:text-is("sparkles"))',
    'button:has(svg[data-icon="arrow_forward"])',
    'button[aria-label*="generate" i]',
    'button[aria-label*="생성" i]',
    'button[aria-label*="submit" i]',
    'button:has-text("Generate")',
    'button:has-text("생성")'
  ],

  // Reference picker button patterns
  mediaPickerButton: [
    'button:has-text("add_2")',
    'button:has(:text-is("add_2"))',
    'button:has(:text-is("add_photo_alternate"))',
    'button[aria-label*="media" i]',
    'button[aria-label*="reference" i]',
    'button[aria-label*="미디어" i]',
    'button[aria-label*="레퍼런스" i]',
    'button:has-text("미디어 추가")',
    'button:has-text("Add media")'
  ],

  // New Project button patterns
  newProjectButton: [
    'button:has-text("새 프로젝트")',
    'button:has-text("New project")',
    'button:has-text("New Project")',
    'button:has-text("Create project")',
    'button:has-text("新規プロジェクト")',
    'button:has(:text-is("add"))',
    'a[href*="/tools/flow/project/new"]'
  ]
};

/**
 * Finds the first visible element matching an array of candidate selectors.
 */
export async function findFirstMatchingLocator(page, selectorList, timeoutMs = 2000) {
  for (const selector of selectorList) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: timeoutMs })) {
        return { locator, selector };
      }
    } catch (e) {
      // try next selector
    }
  }
  return null;
}

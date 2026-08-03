import { describe, expect, it } from 'vitest';
import { normalizeDirections, normalizeInputIdeas, normalizeSynthesis } from './server.js';

describe('normalizeInputIdeas', () => {
  it('keeps valid unique ideas and drops malformed entries', () => {
    const ideas = normalizeInputIdeas([
      { id: 'n1', type: 'problem', content: 'Slow onboarding' },
      { id: 'n1', type: 'method', content: 'Duplicate id' },
      { id: 'n2', type: 'unknown', content: 'New workflow' },
      { id: '', type: 'problem', content: 'Missing id' }
    ]);

    expect(ideas).toEqual([
      { id: 'n1', type: 'problem', content: 'Slow onboarding' },
      { id: 'n2', type: 'opportunity', content: 'New workflow' }
    ]);
  });
});

describe('normalizeDirections', () => {
  const ideaNodes = [
    { id: 'n1', type: 'problem', content: 'Slow onboarding' },
    { id: 'n2', type: 'method', content: 'Guided setup' },
    { id: 'n3', type: 'application', content: 'Team dashboard' }
  ];

  it('deduplicates idea assignments and preserves unassigned ideas', () => {
    const directions = normalizeDirections([
      {
        title: 'Activation',
        summary: 'Improve first-run user activation.',
        idea_ids: ['n1', 'n2', 'n2', 'missing']
      }
    ], ideaNodes);

    expect(directions).toEqual([
      {
        direction_id: 'D1',
        title: 'Activation',
        summary: 'Improve first-run user activation.',
        idea_ids: ['n1', 'n2']
      },
      {
        direction_id: 'D2',
        title: 'Unsorted Insights',
        summary: 'Ideas that did not fit the dominant direction patterns.',
        idea_ids: ['n3']
      }
    ]);
  });

  it('creates a fallback direction when the model returns no usable grouping', () => {
    expect(normalizeDirections([], ideaNodes)).toEqual([
      {
        direction_id: 'D1',
        title: 'Unsorted Insights',
        summary: 'Ideas that did not fit the dominant direction patterns.',
        idea_ids: ['n1', 'n2', 'n3']
      }
    ]);
  });
});

describe('normalizeSynthesis', () => {
  const directions = [
    { direction_id: 'D1', title: 'Activation', summary: 'Improve setup.', idea_ids: ['n1'] },
    { direction_id: 'D2', title: 'Retention', summary: 'Keep teams returning.', idea_ids: ['n2'] }
  ];

  it('fills missing direction analysis and filters invalid comparison ids', () => {
    const synthesis = normalizeSynthesis({
      problem_statement: {
        interpreted_goal: 'Choose the best growth direction.',
        key_assumptions: ['Users need faster setup.']
      },
      directions_analysis: [
        {
          direction_id: 'D2',
          value: 'Improves repeat engagement.',
          risks: ['May need more data.'],
          unknowns: ['Which segment returns?'],
          potential: 'high'
        }
      ],
      comparison: {
        most_promising: 'missing',
        can_be_combined: ['D1', 'missing'],
        should_deprioritize: ['D2', 'D3']
      },
      next_actions: {
        immediate_steps: ['Interview five users.'],
        questions_to_answer: ['What blocks activation?'],
        validation_methods: ['Prototype test.']
      },
      detected_mode: 'startup'
    }, directions, 'Pick a growth path');

    expect(synthesis.comparison).toEqual({
      most_promising: 'D2',
      can_be_combined: ['D1'],
      should_deprioritize: []
    });
    expect(synthesis.directions_analysis).toHaveLength(2);
    expect(synthesis.directions_analysis[0]).toMatchObject({
      direction_id: 'D1',
      potential: 'medium'
    });
  });

  it('anchors the recommended direction to an explicit user selection', () => {
    const synthesis = normalizeSynthesis({ comparison: { most_promising: 'D1' } }, directions, 'Choose a path', {
      selected_direction_id: 'D2',
      criteria: [{ label: 'Feasibility', weight: 4 }]
    });

    expect(synthesis.comparison.most_promising).toBe('D2');
  });
});

import { SyntaxNode } from '@lezer/common';
import { EditorState } from '@codemirror/state';
import { Matcher } from '../types';
export declare function buildLabelMatchers(labelMatchers: SyntaxNode[], state: EditorState): Matcher[];
export declare function labelMatchersToString(metricName: string, matchers?: Matcher[], labelName?: string): string;

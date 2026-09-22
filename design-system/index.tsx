/**
 * React binding for the Fox3 Academy cockpit UI kit.
 *
 * The app itself has no UI framework: `src/ui` exports DOM factories that return an element (or a
 * handle with `.el`). This package wraps those same factories so the design tooling can render real
 * components. Nothing here re-implements markup — every component calls the kit factory, so a card
 * in the design pane and a panel in the app are built by the same code.
 *
 * Props are the factories' own option types, re-exported as `<Name>Props`.
 */
import { useEffect, useRef, createElement, Fragment, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Child } from '../src/ui/dom';
import {
  placard, group, row, button, toggle, segmented, slider, select, chips, tabs,
  type ButtonOptions, type ToggleOptions, type SegmentedOptions, type SliderOptions,
  type SelectOptions, type ChipsOptions, type TabsOptions,
} from '../src/ui/controls';
import {
  disclosure, consolePanel, screenBezel, coachBox, checklist, eventLog, readouts, callout, lamp,
  modal, toast, dataTable,
  type DisclosureOptions, type ConsolePanelOptions, type ScreenBezelOptions, type CoachOptions,
  type ChecklistOptions, type EventLogOptions, type ReadoutsOptions, type CalloutOptions,
  type LampOptions, type ModalOptions, type ToastOptions, type TableOptions,
} from '../src/ui/panels';
import {
  pageHeader, labLayout, docLayout, split,
  type PageHeaderOptions, type LabLayoutOptions, type DocLayoutOptions, type SplitOptions,
} from '../src/ui/layout';

export type { Child };

// ---- the page ground ---------------------------------------------------------------------------

export interface CockpitGroundProps {
  children?: ReactNode;
  /** Cockpit skin: Soviet turquoise for Flankers and Fulcrums, gull grey for the Western jets. */
  cockpit?: 'us' | 'ru';
  /** Padding around the content, in the kit's gap scale. */
  pad?: string;
}

/**
 * The page the kit is built for: dark ground, body font, the selected jet's cockpit skin.
 * An app gets this from `body` in base.css; a preview card mounts outside `body`, so it wraps
 * its content in this instead. The skin is chosen on the document element, as the app does it.
 */
export const CockpitGround = ({ children, cockpit = 'us', pad = 'var(--gap-4)' }: CockpitGroundProps): ReactElement => {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-cockpit');
    root.setAttribute('data-cockpit', cockpit);
    return () => { previous === null ? root.removeAttribute('data-cockpit') : root.setAttribute('data-cockpit', previous); };
  }, [cockpit]);
  return createElement('div', {
    style: {
      background: 'var(--ground)', color: 'var(--ground-ink)', fontFamily: 'var(--font-body)',
      fontSize: '15px', lineHeight: 1.5, padding: pad,
    },
  }, children);
};

// ---- the wrappers ------------------------------------------------------------------------------

type Made = HTMLElement | { el: HTMLElement };
const elementOf = (made: Made): HTMLElement => (made instanceof HTMLElement ? made : made.el);

/** The mount point takes no box of its own, so the kit's own layout rules still apply. */
const mountPoint = (ref: React.RefObject<HTMLDivElement | null>): ReactElement =>
  createElement('div', { ref, style: { display: 'contents' } });

/**
 * Props the kit types as `Child` (a DOM node) that this binding also accepts as JSX.
 * `array` marks the ones the factory wants as a list (`children`, `items`).
 */
type Slot = string | { key: string; array: true };

/**
 * Renders JSX passed to a container prop into a detached host element, which is what the factory
 * receives. Without this, `<ConsolePanel>` and friends could only take strings: the kit composes
 * with DOM nodes, not React children.
 */
function useSlots<P extends object>(props: P, slots: Slot[]): [P, ReactElement[]] {
  const hosts = useRef<Record<string, HTMLElement>>({});
  const portals: ReactElement[] = [];
  const next: Record<string, unknown> = { ...(props as Record<string, unknown>) };
  for (const slot of slots) {
    const key = typeof slot === 'string' ? slot : slot.key;
    const value = (props as Record<string, unknown>)[key];
    // Strings, numbers and real nodes are already Child: only JSX needs a host.
    if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || value instanceof Node) continue;
    let host = hosts.current[key];
    if (!host) {
      host = document.createElement('div');
      host.style.display = 'contents';
      hosts.current[key] = host;
    }
    next[key] = typeof slot === 'string' ? host : [host];
    portals.push(createPortal(value as ReactNode, host, key));
  }
  return [next as P, portals];
}

/**
 * Wrap a factory that returns an element or a handle. The element is rebuilt whenever props change:
 * the kit's handles are imperative (`set`, `setDisabled`), and rebuilding keeps this binding honest
 * instead of half-mirroring each handle's setters.
 */
function fromFactory<P extends object>(make: (props: P) => Made, name: string, slots: Slot[] = []) {
  const Component = (props: P): ReactElement => {
    const host = useRef<HTMLDivElement>(null);
    const [resolved, portals] = useSlots(props, slots);
    useEffect(() => {
      const node = host.current;
      if (!node) return;
      const el = elementOf(make(resolved));
      node.append(el);
      return () => el.remove();
    });
    return createElement(Fragment, null, mountPoint(host), ...portals);
  };
  Component.displayName = name;
  return Component;
}

/** For factories that mount themselves into a host (the overlays: they take `within`). */
function fromHostFactory<P extends object>(make: (props: P, host: HTMLElement) => () => void, name: string, slots: Slot[] = []) {
  const Component = (props: P): ReactElement => {
    const host = useRef<HTMLDivElement>(null);
    const [resolved, portals] = useSlots(props, slots);
    useEffect(() => {
      const node = host.current;
      if (!node) return;
      return make(resolved, node);
    });
    return createElement(Fragment, null,
      createElement('div', { ref: host, style: { position: 'relative', minHeight: '1px' } }), ...portals);
  };
  Component.displayName = name;
  return Component;
}

// ---- controls ----------------------------------------------------------------------------------

export interface PlacardProps {
  /** Stencilled label text. */
  text: Child;
  id?: string;
  /** Renders a `<label>` bound to this control id. */
  for?: string;
  tag?: 'span' | 'label' | 'div';
}
export type GroupProps = Parameters<typeof group>[0];
export interface RowProps {
  /** Controls laid out in a row that wraps on narrow screens. */
  items: Child[];
}
export type ButtonProps = ButtonOptions;
export type ToggleProps = ToggleOptions;
export type SegmentedProps = SegmentedOptions<string>;
export type SliderProps = SliderOptions;
export type SelectProps = SelectOptions<string>;
export type ChipsProps = ChipsOptions<string>;
export type TabsProps = TabsOptions;

export const Placard = fromFactory<PlacardProps>(({ text, ...o }) => placard(text, o), 'Placard', ['text']);
export const Group = fromFactory<GroupProps>(group, 'Group', [{ key: 'children', array: true }]);
export const Row = fromFactory<RowProps>(({ items }) => row(...items), 'Row', [{ key: 'items', array: true }]);
export const Button = fromFactory<ButtonProps>(button, 'Button', ['label']);
export const Toggle = fromFactory<ToggleProps>(toggle, 'Toggle');
export const Segmented = fromFactory<SegmentedProps>(segmented, 'Segmented');
export const Slider = fromFactory<SliderProps>(slider, 'Slider');
export const Select = fromFactory<SelectProps>(select, 'Select');
export const Chips = fromFactory<ChipsProps>(chips, 'Chips');
export const Tabs = fromFactory<TabsProps>(tabs, 'Tabs');

// ---- panels ------------------------------------------------------------------------------------

export type DisclosureProps = DisclosureOptions;
export type ConsolePanelProps = ConsolePanelOptions;
export type ScreenBezelProps = ScreenBezelOptions;
export type CoachBoxProps = CoachOptions;
export type ChecklistProps = ChecklistOptions;
export type EventLogProps = EventLogOptions;
export type ReadoutsProps = ReadoutsOptions;
export type CalloutProps = CalloutOptions;
export type LampProps = LampOptions;
export type DataTableProps = TableOptions<Record<string, unknown>>;
export interface ModalProps extends Omit<ModalOptions, 'within'> {
  /** Modals render inside their card, not over the page. */
  open?: boolean;
}
export interface ToastProps extends Omit<ToastOptions, 'within'> {
  text: Child;
}

export const Disclosure = fromFactory<DisclosureProps>(disclosure, 'Disclosure', ['content']);
export const ConsolePanel = fromFactory<ConsolePanelProps>(consolePanel, 'ConsolePanel', ['children', 'actions']);
export const ScreenBezel = fromFactory<ScreenBezelProps>(screenBezel, 'ScreenBezel', ['content', 'status', 'footer']);
export const CoachBox = fromFactory<CoachBoxProps>(coachBox, 'CoachBox', ['text', 'why']);
export const Checklist = fromFactory<ChecklistProps>(checklist, 'Checklist');
export const EventLog = fromFactory<EventLogProps>(eventLog, 'EventLog', ['title']);
export const Readouts = fromFactory<ReadoutsProps>(readouts, 'Readouts');
export const Callout = fromFactory<CalloutProps>(callout, 'Callout', ['title', 'body']);
export const Lamp = fromFactory<LampProps>(lamp, 'Lamp');
export const DataTable = fromFactory<DataTableProps>(dataTable, 'DataTable', ['caption']);

export const Modal = fromHostFactory<ModalProps>((props, host) => {
  const handle = modal({ ...props, within: host, open: props.open !== false });
  return () => handle.destroy();
}, 'Modal', ['body']);

export const Toast = fromHostFactory<ToastProps>(({ text, ...o }, host) => {
  const dismiss = toast(text, { ...o, within: host });
  return () => dismiss();
}, 'Toast', ['text']);

// ---- layout ------------------------------------------------------------------------------------

export type PageHeaderProps = PageHeaderOptions;
export type LabLayoutProps = LabLayoutOptions;
export type DocLayoutProps = DocLayoutOptions;
export type SplitProps = SplitOptions;

export const PageHeader = fromFactory<PageHeaderProps>(pageHeader, 'PageHeader', ['title', 'lede', 'actions', 'meta']);
export const LabLayout = fromFactory<LabLayoutProps>(labLayout, 'LabLayout', ['viewport', 'console', 'strip', 'mobileActions']);
export const DocLayout = fromFactory<DocLayoutProps>(docLayout, 'DocLayout', ['content', 'tocHeader', 'lede', 'meta', 'actions']);
export const Split = fromFactory<SplitProps>(split, 'Split', [{ key: 'items', array: true }]);

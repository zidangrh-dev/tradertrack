import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native';
import { colors, pickupMethodLabel, radius, space, statusLabel, type Status } from '../theme';
import { durationLabel, statusPalette } from '../lib/format';
import type { OrderView } from '../lib/api';

/* ---------- Button ---------- */

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_HEIGHT: Record<ButtonSize, number> = { sm: 32, md: 40, lg: 46 };
const BTN_FONT: Record<ButtonSize, number> = { sm: 12, md: 13, lg: 14 };

const BTN_VARIANT: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.line },
  soft: { bg: colors.primarySoft, fg: colors.primary },
  ghost: { bg: 'transparent', fg: colors.primary },
  danger: { bg: '#FCE9E6', fg: '#C1433A' },
};

export function Button({
  label, onPress, variant = 'primary', size = 'md', disabled, icon, style, fullWidth,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}) {
  const v = BTN_VARIANT[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        {
          height: BTN_HEIGHT[size],
          backgroundColor: v.bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        fullWidth && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {!!icon && <Text style={[styles.buttonIcon, { color: v.fg, fontSize: BTN_FONT[size] + 3 }]}>{icon}</Text>}
      <Text style={[styles.buttonText, { color: v.fg, fontSize: BTN_FONT[size] }]}>{label}</Text>
    </Pressable>
  );
}

/* ---------- Chip (filter/segmen) ---------- */

export function Chip({ label, selected, onPress, compact }: { label: string; selected: boolean; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { height: compact ? 30 : 36, backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.line, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.onPrimary : colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

/* ---------- Status & avatar ---------- */

export function StatusTag({ status, compact }: { status: Status; compact?: boolean }) {
  const palette = statusPalette(status);
  return (
    <Text style={[styles.tag, { color: palette.color, backgroundColor: palette.bg }, compact && { paddingHorizontal: 6, paddingVertical: 3 }]}>
      {statusLabel[status]}
    </Text>
  );
}

const AVATAR_COLORS = ['#DF9B65', '#9C91C9', '#73A6D1', '#6BB68B', '#D58AA0'];

export function Avatar({ name, size = 20 }: { name: string; size?: number }) {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_COLORS.length;
  const initials = name.replace(/[^a-zA-Z ]/g, '').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR_COLORS[idx] }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  );
}

/* ---------- Form ---------- */

export function Field({ label, hint, ...rest }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {!!hint && <Text style={styles.fieldHint}>{hint}</Text>}
      <TextInput style={styles.input} placeholderTextColor={colors.faint} {...rest} />
    </View>
  );
}

export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.selectRow}>
        {options.map((o) => (
          <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

/* ---------- Sheet (modal) ---------- */

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, wide && styles.sheetWide]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ---------- Select (dropdown anchored ala ERP) ---------- */

export interface SelectOption {
  value: string;
  label: string;
  sub?: string;
}

// react-native-web mendukung transisi CSS; tipe RN belum memuatnya.
const webTransition = (props: string, duration = '140ms') =>
  ({ transitionProperty: props, transitionDuration: duration }) as unknown as ViewStyle;

function useHover() {
  const [hovered, setHovered] = useState(false);
  return {
    hovered,
    handlers: {
      onHoverIn: () => setHovered(true),
      onHoverOut: () => setHovered(false),
    },
  };
}

export function Select({
  label, value, options, onChange, placeholder = 'Pilih…', clearLabel, onAdd, addLabel,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  clearLabel?: string;
  onAdd?: () => void;
  addLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0 });
  const ref = useRef<View>(null);
  const { width: winW, height: winH } = useWindowDimensions();
  const triggerHover = useHover();

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    ref.current?.measureInWindow((x, y, w) => {
      setAnchor({ x, y: y + 50, w });
      setOpen(true);
    });
  };

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const selected = options.find((o) => o.value === value);
  const itemCount = options.length + (clearLabel ? 1 : 0) + (onAdd ? 1 : 0);
  const menuW = Math.min(Math.max(anchor.w, 260), 360);
  const left = Math.max(12, Math.min(anchor.x, winW - menuW - 12));
  const top = Math.min(anchor.y, Math.max(12, winH - itemCount * 50 - 16));

  return (
    <View ref={ref}>
      <Pressable
        onPress={toggle}
        {...triggerHover.handlers}
        style={({ pressed }) => [
          selStyles.trigger,
          webTransition('background-color, border-color, opacity'),
          triggerHover.hovered && !open && selStyles.triggerHover,
          open && selStyles.triggerOpen,
          !!value && selStyles.triggerActive,
          pressed && { opacity: 0.9 },
        ]}
      >
        <Text style={[selStyles.caption, !!value && selStyles.captionActive]}>{label}</Text>
        <Text style={[selStyles.value, !!value && selStyles.valueActive]} numberOfLines={1}>{selected ? selected.label : placeholder}</Text>
        <Text style={selStyles.caret}>▾</Text>
      </Pressable>

      <Modal transparent visible={open} onRequestClose={() => setOpen(false)} animationType="fade">
        <Pressable style={selStyles.backdrop} onPress={() => setOpen(false)}>
          <View style={[selStyles.menu, { left, top, width: menuW }]}>
            {!!clearLabel && (
              <HoverItem onPress={() => pick('')} style={[selStyles.item, !value && selStyles.itemActive]} hoverStyle={selStyles.itemHover}>
                <Text style={[selStyles.itemLabel, !value && selStyles.itemLabelActive]} numberOfLines={1}>{clearLabel}</Text>
                {!value && <Text style={selStyles.check}>✓</Text>}
              </HoverItem>
            )}
            {options.map((opt) => {
              const sel = opt.value === value;
              return (
                <HoverItem key={opt.value} onPress={() => pick(opt.value)} style={[selStyles.item, sel && selStyles.itemActive]} hoverStyle={sel ? undefined : selStyles.itemHover}>
                  <View style={{ flex: 1 }}>
                    <Text style={[selStyles.itemLabel, sel && selStyles.itemLabelActive]} numberOfLines={1}>{opt.label}</Text>
                    {!!opt.sub && <Text style={selStyles.itemSub} numberOfLines={1}>{opt.sub}</Text>}
                  </View>
                  {sel && <Text style={selStyles.check}>✓</Text>}
                </HoverItem>
              );
            })}
            {!!onAdd && (
              <>
                <View style={selStyles.divider} />
                <HoverItem onPress={() => { onAdd(); setOpen(false); }} style={selStyles.addBtn} hoverStyle={selStyles.addHover} pressedStyle={selStyles.addPressed}>
                  <Text style={selStyles.addIcon}>＋</Text>
                  <Text style={selStyles.addText}>{addLabel ?? 'Tambah baru'}</Text>
                </HoverItem>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function HoverItem({
  onPress, children, style, hoverStyle, pressedStyle,
}: {
  onPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  hoverStyle?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
}) {
  const { hovered, handlers } = useHover();
  return (
    <Pressable
      onPress={onPress}
      {...handlers}
      style={({ pressed }) => [
        style,
        webTransition('background-color'),
        hovered && !pressed && hoverStyle,
        pressed && (pressedStyle ?? selStyles.itemPressed),
      ]}
    >
      {children}
    </Pressable>
  );
}

/* ---------- Page & states ---------- */

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pageTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.pageSubtitle}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconBox}>
        <Text style={styles.emptyIcon}>{icon}</Text>
      </View>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

/* ---------- Order card ---------- */

export function OrderCard({
  order, onPress, actions,
}: {
  order: OrderView;
  onPress: () => void;
  actions?: React.ReactNode;
}) {
  const pal = statusPalette(order.status);
  return (
    <Pressable style={({ pressed }) => [styles.orderCard, order.is_problem && styles.orderCardProblem, pressed && { opacity: 0.92 }]} onPress={onPress}>
      <View style={styles.orderTop}>
        <Text style={styles.orderNumber}>#{order.order_number}</Text>
        {order.is_problem ? (
          <Badge label="Bermasalah" color="#C1433A" bg="#FCE9E6" />
        ) : order.is_pending ? (
          <Badge label="Tertunda" color="#A8610F" bg="#FCF1DE" />
        ) : (
          <Text style={[styles.tag, { color: pal.color, backgroundColor: pal.bg }]}>{statusLabel[order.status]}</Text>
        )}
      </View>
      <Text style={styles.orderProduct} numberOfLines={2}>{order.product_name}</Text>
      <Text style={styles.orderMeta} numberOfLines={1}>
        {order.store_name} · {order.recipient_name} · {pickupMethodLabel[order.pickup_method]}
      </Text>
      <View style={styles.orderFoot}>
        <View style={styles.person}>
          <Avatar name={order.trader_name} size={18} />
          <Text style={styles.personName}>{order.trader_name}</Text>
        </View>
        <View style={styles.orderFootRight}>
          {order.status === 'selesai' && <Text style={styles.proof}>▣ {order.photo_count}</Text>}
          <Text style={styles.orderTime}>{durationLabel(order.updated_at)}</Text>
        </View>
      </View>
      {actions}
    </Pressable>
  );
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return <Text style={[styles.tag, { color, backgroundColor: bg }]}>{label}</Text>;
}

/* ---------- DataTable ---------- */

export interface DataTableColumn<T> {
  key: string;
  label: string;
  sortKey?: keyof T;
  width?: number;
  render: (item: T) => React.ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  sortKey,
  sortDir,
  onSort,
  onRowPress,
  emptyText,
  page,
  totalPages,
  totalItems,
  onPageChange,
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  onRowPress?: (item: T) => void;
  emptyText?: string;
  page?: number;
  totalPages?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
}) {
  if (data.length === 0 && emptyText) {
    return (
      <View style={dtStyles.emptyWrap}>
        <Text style={dtStyles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={dtStyles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dtStyles.scrollContent}>
        <View style={dtStyles.table}>
          {/* Header */}
          <View style={dtStyles.headerRow}>
            {columns.map((col) => {
              const active = sortKey === col.key;
              const isAsc = active && sortDir === 'asc';
              return (
                <Pressable
                  key={col.key}
                  style={[dtStyles.headerCell, col.width ? { width: col.width } : { flex: 1 }]}
                  onPress={() => col.sortKey && onSort?.(col.key)}
                  disabled={!col.sortKey}
                >
                  <Text style={[dtStyles.headerText, active && dtStyles.headerTextActive]} numberOfLines={1}>
                    {col.label}
                  </Text>
                  {col.sortKey && (
                    <Text style={[dtStyles.sortArrow, active ? dtStyles.sortArrowActive : dtStyles.sortArrowInactive]}>
                      {active ? (isAsc ? '▲' : '▼') : '⇅'}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Rows */}
          {data.map((item, idx) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [
                dtStyles.dataRow,
                idx % 2 === 1 && dtStyles.dataRowAlt,
                pressed && onRowPress && { backgroundColor: colors.primarySoft },
              ]}
              onPress={() => onRowPress?.(item)}
              disabled={!onRowPress}
            >
              {columns.map((col) => (
              <View key={col.key} style={[dtStyles.dataCell, col.width ? { width: col.width } : { flex: 1 }]}>
                  {col.render(item)}
                </View>
              ))}
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Pagination */}
      {totalPages != null && totalPages > 0 && (
        <View style={dtStyles.pagination}>
          <Text style={dtStyles.pageInfo}>
            {totalItems != null ? `${totalItems} order` : ''}
          </Text>
          <View style={dtStyles.pageButtons}>
            <Pressable
              style={[dtStyles.pageBtn, (!page || page <= 1) && dtStyles.pageBtnDisabled]}
              onPress={() => page && page > 1 && onPageChange?.(page - 1)}
              disabled={!page || page <= 1}
            >
              <Text style={[dtStyles.pageBtnText, (!page || page <= 1) && dtStyles.pageBtnTextDisabled]}>‹</Text>
            </Pressable>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page! <= 4) {
                pageNum = i + 1;
              } else if (page! >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page! - 3 + i;
              }
              const isActive = pageNum === page;
              return (
                <Pressable
                  key={pageNum}
                  style={[dtStyles.pageBtn, isActive && dtStyles.pageBtnActive]}
                  onPress={() => onPageChange?.(pageNum)}
                >
                  <Text style={[dtStyles.pageBtnText, isActive && dtStyles.pageBtnTextActive]}>{pageNum}</Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[dtStyles.pageBtn, (!page || page >= totalPages) && dtStyles.pageBtnDisabled]}
              onPress={() => page && page < totalPages && onPageChange?.(page + 1)}
              disabled={!page || page >= totalPages}
            >
              <Text style={[dtStyles.pageBtnText, (!page || page >= totalPages) && dtStyles.pageBtnTextDisabled]}>›</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const selStyles = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 46, paddingHorizontal: 12, alignSelf: 'flex-start', minWidth: 180, maxWidth: '100%',
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface,
  },
  triggerHover: { backgroundColor: '#F5F6FA', borderColor: '#D4D9E4' },
  triggerOpen: { borderColor: colors.primary },
  triggerActive: { borderColor: '#C7CFFB', backgroundColor: colors.primarySoft },
  caption: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: colors.faint, textTransform: 'uppercase' },
  captionActive: { color: colors.primaryMuted },
  value: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.muted, textAlign: 'right' },
  valueActive: { color: colors.primary },
  caret: { fontSize: 10, color: colors.faint },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,22,42,0.04)' },
  menu: {
    position: 'absolute',
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
    shadowColor: '#0F162A', shadowOpacity: 0.14, shadowOffset: { width: 0, height: 10 }, shadowRadius: 22, elevation: 10,
  },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44 },
  itemActive: { backgroundColor: colors.primarySoft },
  itemHover: { backgroundColor: '#F2F4F9' },
  itemPressed: { backgroundColor: colors.surfaceAlt },
  itemLabel: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  itemLabelActive: { color: colors.primary, fontWeight: '700' },
  itemSub: { fontSize: 10, color: colors.faint, marginTop: 2 },
  check: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.line },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, backgroundColor: colors.primarySoft },
  addHover: { backgroundColor: '#DFE4FD' },
  addPressed: { backgroundColor: '#D9DFFB' },
  addIcon: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  addText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
});

const dtStyles = StyleSheet.create({  container: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  scrollContent: { flexGrow: 1 },
  table: { width: '100%', minWidth: 1100 },
  headerRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: '#F8F9FC' },
  headerCell: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 48 },
  headerText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.faint },
  headerTextActive: { color: colors.primary },
  sortArrow: { fontSize: 9, marginLeft: 2 },
  sortArrowActive: { color: colors.primary },
  sortArrowInactive: { color: colors.faint },
  dataRow: { flexDirection: 'row', minHeight: 80, borderBottomWidth: 1, borderBottomColor: colors.line },
  dataRowAlt: { backgroundColor: '#FCFCFE' },
  dataCell: { paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  emptyWrap: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingVertical: 56, alignItems: 'center' },
  emptyText: { fontSize: 14, color: colors.muted },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FCFCFE', borderTopWidth: 1, borderTopColor: colors.line },
  pageInfo: { fontSize: 12, color: colors.muted },
  pageButtons: { flexDirection: 'row', gap: 5 },
  pageBtn: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  pageBtnActive: { backgroundColor: colors.primary },
  pageBtnDisabled: { opacity: 0.35 },
  pageBtnText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  pageBtnTextActive: { color: colors.onPrimary },
  pageBtnTextDisabled: { color: colors.faint },
});

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  // Button
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: radius.md, paddingHorizontal: space.lg, alignSelf: 'flex-start',
  },
  buttonIcon: { fontWeight: '800' },
  buttonText: { fontWeight: '700' },
  // Chip
  chip: {
    borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: space.md, alignSelf: 'flex-start',
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  // Tag & avatar
  tag: { fontSize: 9, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, overflow: 'hidden' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800' },
  // Field
  field: { marginBottom: 13 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.muted },
  fieldHint: { fontSize: 9, color: colors.faint, marginTop: 2 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface,
    height: 42, paddingHorizontal: 12, marginTop: 6, fontSize: 13, color: colors.text,
  },
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  // Sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(15,22,42,.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, width: '100%', maxWidth: 460, maxHeight: '88%', padding: 20, shadowColor: '#0F162A', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 16 }, shadowRadius: 32, elevation: 12 },
  sheetWide: { maxWidth: 560 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  close: { fontSize: 26, color: colors.faint, paddingHorizontal: 4 },
  // Page
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  pageSubtitle: { fontSize: 11, color: colors.muted, marginTop: 3 },
  // Empty
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  emptyIconBox: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 24, color: colors.primaryMuted },
  emptyText: { fontSize: 12, color: colors.muted, paddingHorizontal: 32, textAlign: 'center', lineHeight: 18 },
  // Order card
  orderCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1,
    borderColor: colors.line, shadowColor: '#0F162A', shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 2,
  },
  orderCardProblem: { borderTopWidth: 3, borderTopColor: colors.red },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  orderNumber: { fontSize: 10, fontWeight: '800', color: colors.primaryMuted },
  orderProduct: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 8 },
  orderMeta: { fontSize: 11, color: colors.muted, marginTop: 3 },
  orderFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  personName: { fontSize: 10, color: colors.muted },
  orderFootRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  proof: { fontSize: 9, fontWeight: '700', color: '#1F7A4D' },
  orderTime: { fontSize: 9, color: colors.faint },
});

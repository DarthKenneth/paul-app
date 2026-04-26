// =============================================================================
// ProfessionContext.js - Active profession context, provider, and hook
// Version: 3.0
// Last Updated: 2026-04-24
//
// PROJECT:      Rolodeck (project v0.28)
// FILES:        ProfessionContext.js      (this file — context + provider + hook)
//               src/data/professions/     (profession preset configs)
//               App.js                   (wraps AppInner with ProfessionProvider)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - ProfessionProvider loads all profession-scoped state on mount:
//     - @callout_profession: active profession key (string)
//     - @callout_type_durations_{key}: user-overridden type durations { [typeId]: mins }
//     - @callout_lists_{key}: user-overridden custom lists { [listKey]: string[] }
//     - @callout_checklist_{key}: per-item visibility overrides { [itemId]: boolean }
//     - @callout_checklist_visible_{key}: checklist section show/hide on Add Service
//     - @callout_type_config_{key}: { hidden: string[], custom: [{id,label,icon,defaultMins}] }
//     - @callout_checklist_custom_{key}: [{id, label, type}] user-created checklist items
//   - Merges stored overrides with profession preset defaults so callers always get
//     full effective values — no merging needed at call site
//   - useProfession() returns:
//     - profession: full preset object (serviceTypes, customLists, checklist, etc.)
//     - professionKey: string key (e.g. 'water')
//     - typeDurations: { [typeId]: mins } — merged defaults + user overrides (incl. custom)
//     - customLists: { [listKey]: string[] } — merged defaults + user overrides
//     - checklistItems: [{ id, label, type, visible }] — defaults + custom, with visibility
//     - checklistVisible: boolean — show/hide checklist section on Add Service form
//     - typeConfig: { hidden: string[], custom: [{id,label,icon,defaultMins}] }
//     - effectiveServiceTypes: non-hidden default types + all custom types (for pickers)
//     - allServiceTypes: all default + all custom types (for log entry lookups)
//     - setProfession(key), saveTypeDuration(typeId, mins),
//       saveCustomList(listKey, items), saveChecklistItem(itemId, visible),
//       saveChecklistVisible(visible), saveTypeConfig({hidden, custom}),
//       saveChecklistCustom(items)
//   - All existing callers that only access profession/professionKey are backward-compat
//   - Defaults are always structurally valid so callers never need null-checks
//
// CHANGE LOG:
// v1.0  2026-04-23  Claude  Initial implementation (profession + setProfession only)
// v2.0  2026-04-23  Claude  Full profession state expansion
//       - Added typeDurations, customLists, checklistItems, checklistVisible
//       - Per-profession AsyncStorage keys for all four new state dimensions
//       - saveTypeDuration, saveCustomList, saveChecklistItem, saveChecklistVisible
//       - Defaults merged at provider level so consumers receive fully computed values
//       [updated ARCHITECTURE]
// v3.0  2026-04-24  Claude  Editable service types and checklist items
//       - @callout_type_config_{key}: hidden type IDs + custom type objects
//       - @callout_checklist_custom_{key}: user-created checklist items
//       - effectiveServiceTypes (non-hidden defaults + custom types — for pickers)
//       - allServiceTypes (all defaults + custom — for log entry lookups)
//       - typeDurations now includes custom type entries
//       - checklistItems now includes custom checklist items
//       - saveTypeConfig({ hidden, custom }), saveChecklistCustom(items)
//       [updated ARCHITECTURE]
// =============================================================================

import React, {
  createContext, useContext, useState, useEffect, useMemo, useCallback,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROFESSIONS, DEFAULT_PROFESSION_KEY } from '../data/professions';

// ── Storage keys ──────────────────────────────────────────────────────────────

const PROF_KEY     = '@callout_profession';
const durKey       = (pk) => `@callout_type_durations_${pk}`;
const listKey      = (pk) => `@callout_lists_${pk}`;
const clKey        = (pk) => `@callout_checklist_${pk}`;
const clVisKey     = (pk) => `@callout_checklist_visible_${pk}`;
const typeCfgKey   = (pk) => `@callout_type_config_${pk}`;
const clCustomKey  = (pk) => `@callout_checklist_custom_${pk}`;

// ── Context ───────────────────────────────────────────────────────────────────

const ProfessionContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function ProfessionProvider({ children }) {
  const [professionKey, setProfessionKey] = useState(DEFAULT_PROFESSION_KEY);
  const [durOverrides,  setDurOverrides]  = useState({});
  const [listOverrides, setListOverrides] = useState({});
  const [clOverrides,   setClOverrides]   = useState({});
  const [clVisible,     setClVisible]     = useState(true);
  const [typeConfig,    setTypeConfig]    = useState({ hidden: [], custom: [] });
  const [customChecklistItems, setCustomChecklistItems] = useState([]);

  const loadForKey = useCallback(async (pk) => {
    try {
      const [durs, lists, cl, clv, tCfg, clCust] = await Promise.all([
        AsyncStorage.getItem(durKey(pk)),
        AsyncStorage.getItem(listKey(pk)),
        AsyncStorage.getItem(clKey(pk)),
        AsyncStorage.getItem(clVisKey(pk)),
        AsyncStorage.getItem(typeCfgKey(pk)),
        AsyncStorage.getItem(clCustomKey(pk)),
      ]);
      setDurOverrides (durs  ? JSON.parse(durs)  : {});
      setListOverrides(lists ? JSON.parse(lists) : {});
      setClOverrides  (cl   ? JSON.parse(cl)    : {});
      setClVisible(clv !== null ? clv === 'true' : true);
      setTypeConfig(tCfg ? JSON.parse(tCfg) : { hidden: [], custom: [] });
      setCustomChecklistItems(clCust ? JSON.parse(clCust) : []);
    } catch {
      setDurOverrides({});
      setListOverrides({});
      setClOverrides({});
      setClVisible(true);
      setTypeConfig({ hidden: [], custom: [] });
      setCustomChecklistItems([]);
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(PROF_KEY)
      .then((stored) => {
        const pk = (stored && PROFESSIONS[stored]) ? stored : DEFAULT_PROFESSION_KEY;
        setProfessionKey(pk);
        loadForKey(pk);
      })
      .catch(() => loadForKey(DEFAULT_PROFESSION_KEY));
  }, [loadForKey]);

  const setProfession = useCallback(async (key) => {
    if (!PROFESSIONS[key]) return;
    setProfessionKey(key);
    await AsyncStorage.setItem(PROF_KEY, key);
    loadForKey(key);
  }, [loadForKey]);

  const saveTypeDuration = useCallback(async (typeId, mins) => {
    const next = { ...durOverrides, [typeId]: mins };
    setDurOverrides(next);
    await AsyncStorage.setItem(durKey(professionKey), JSON.stringify(next));
  }, [durOverrides, professionKey]);

  const saveCustomList = useCallback(async (lk, items) => {
    const next = { ...listOverrides, [lk]: items };
    setListOverrides(next);
    await AsyncStorage.setItem(listKey(professionKey), JSON.stringify(next));
  }, [listOverrides, professionKey]);

  const saveChecklistItem = useCallback(async (itemId, visible) => {
    const next = { ...clOverrides, [itemId]: visible };
    setClOverrides(next);
    await AsyncStorage.setItem(clKey(professionKey), JSON.stringify(next));
  }, [clOverrides, professionKey]);

  const saveChecklistVisible = useCallback(async (visible) => {
    setClVisible(visible);
    await AsyncStorage.setItem(clVisKey(professionKey), String(visible));
  }, [professionKey]);

  const saveTypeConfig = useCallback(async (config) => {
    setTypeConfig(config);
    await AsyncStorage.setItem(typeCfgKey(professionKey), JSON.stringify(config));
  }, [professionKey]);

  const saveChecklistCustom = useCallback(async (items) => {
    setCustomChecklistItems(items);
    await AsyncStorage.setItem(clCustomKey(professionKey), JSON.stringify(items));
  }, [professionKey]);

  const profession = useMemo(() => PROFESSIONS[professionKey], [professionKey]);

  const allServiceTypes = useMemo(() => [
    ...(profession.serviceTypes || []),
    ...(typeConfig.custom || []),
  ], [profession, typeConfig]);

  const effectiveServiceTypes = useMemo(() => {
    const hidden = new Set(typeConfig.hidden || []);
    return [
      ...(profession.serviceTypes || []).filter((t) => !hidden.has(t.id)),
      ...(typeConfig.custom || []),
    ];
  }, [profession, typeConfig]);

  const typeDurations = useMemo(() => {
    const result = {};
    (profession.serviceTypes || []).forEach((t) => {
      result[t.id] = durOverrides[t.id] ?? t.defaultMins;
    });
    (typeConfig.custom || []).forEach((t) => {
      result[t.id] = durOverrides[t.id] ?? t.defaultMins;
    });
    return result;
  }, [profession, durOverrides, typeConfig]);

  const customLists = useMemo(() => {
    const result = {};
    (profession.customLists || []).forEach((list) => {
      result[list.key] = listOverrides[list.key] ?? list.items;
    });
    return result;
  }, [profession, listOverrides]);

  const checklistItems = useMemo(() => {
    const allItems = [
      ...(profession.checklist || []),
      ...customChecklistItems,
    ];
    return allItems.map((item) => ({
      ...item,
      visible: clOverrides[item.id] !== undefined ? clOverrides[item.id] : true,
    }));
  }, [profession, customChecklistItems, clOverrides]);

  const value = useMemo(() => ({
    profession,
    professionKey,
    typeDurations,
    customLists,
    checklistItems,
    checklistVisible: clVisible,
    typeConfig,
    effectiveServiceTypes,
    allServiceTypes,
    setProfession,
    saveTypeDuration,
    saveCustomList,
    saveChecklistItem,
    saveChecklistVisible,
    saveTypeConfig,
    saveChecklistCustom,
  }), [
    profession, professionKey, typeDurations, customLists, checklistItems, clVisible,
    typeConfig, effectiveServiceTypes, allServiceTypes,
    setProfession, saveTypeDuration, saveCustomList, saveChecklistItem, saveChecklistVisible,
    saveTypeConfig, saveChecklistCustom,
  ]);

  return (
    <ProfessionContext.Provider value={value}>
      {children}
    </ProfessionContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useProfession() {
  return useContext(ProfessionContext);
}

// ============================================================
// src/hooks/useAppState.js
// State management wired to the PHP backend.
// - On mount: fetches matches from PHP API
// - Mutations (ADD/DELETE/UPDATE) call PHP API then update state
// ============================================================

import { useReducer, useEffect, useState } from 'react';
import { matchesApi } from '../api/matchesApi';

export const initialState = {
  matches:    [],
  filters:    { map: 'All', type: 'All', player: 'All', opponent: '' },
  activeView: 'dashboard',
  loading:    true,
  error:      null,
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_MATCHES':  return { ...state, matches: action.payload, loading: false, error: null };
    case 'SET_LOADING':  return { ...state, loading: action.value };
    case 'SET_ERROR':    return { ...state, error: action.message, loading: false };
    case 'ADD_MATCH':    return { ...state, matches: [action.payload, ...state.matches] };
    case 'DELETE_MATCH': return { ...state, matches: state.matches.filter((m) => m.id !== action.id) };
    case 'UPDATE_MATCH': return { ...state, matches: state.matches.map((m) => m.id === action.payload.id ? action.payload : m) };
    case 'SET_FILTER':   return { ...state, filters: { ...state.filters, [action.key]: action.value } };
    case 'RESET_FILTERS':return { ...state, filters: initialState.filters };
    case 'SET_VIEW':     return { ...state, activeView: action.view };
    default:             return state;
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [apiError, setApiError] = useState(null);

  // Load matches on mount
  useEffect(() => {
    let cancelled = false;
    matchesApi.getAll()
      .then((matches) => { if (!cancelled) dispatch({ type: 'SET_MATCHES', payload: matches }); })
      .catch((err)    => { if (!cancelled) dispatch({ type: 'SET_ERROR', message: err.message }); });
    return () => { cancelled = true; };
  }, []);

  // API-aware dispatch
  async function apiDispatch(action) {
    setApiError(null);
    try {
      switch (action.type) {
        case 'ADD_MATCH': {
          const created = await matchesApi.create(action.payload);
          dispatch({ type: 'ADD_MATCH', payload: created });
          break;
        }
        case 'DELETE_MATCH': {
          await matchesApi.remove(action.id);
          dispatch({ type: 'DELETE_MATCH', id: action.id });
          break;
        }
        case 'UPDATE_MATCH': {
          const updated = await matchesApi.update(action.payload);
          dispatch({ type: 'UPDATE_MATCH', payload: updated });
          break;
        }
        default:
          dispatch(action);
      }
    } catch (err) {
      setApiError(err.message);
      console.error('API Error:', err.message);
    }
  }

  return { state: { ...state, apiError }, dispatch: apiDispatch };
}

import {createContext, useContext, useReducer} from 'react';
import type { ReactNode } from 'react';
import type { Tool, ToolType, ToolState } from '../types/tools';


type ToolAction = 
| { type: 'SET_ACTIVE_TOOL'; payload: Tool }
| { type: 'CLEAR_ACTIVE_TOOL'; };

const initialState : ToolState = {
    activeToolId: null,
    activeTool: null
};

const toolReducer = (state: ToolState, action: ToolAction): ToolState => {
    switch(action.type) {
        case 'SET_ACTIVE_TOOL':
            return {
                ...state,
                activeToolId: action.payload.id,
                activeTool: action.payload
            };
        case 'CLEAR_ACTIVE_TOOL':
            return {
                ...state,
                activeToolId: null,
                activeTool: null
            };
        default:
            return state;
    }

};

const ToolContext = createContext<{
    state: ToolState;
    dispatch: React.Dispatch<ToolAction>;
} | null>(null);

export const ToolProvider = ({children} : {children: ReactNode}) => {
    const [state, dispatch] = useReducer(toolReducer, initialState);

    return (
        <ToolContext.Provider value={{state, dispatch}}>
            {children}
        </ToolContext.Provider>
    );
};

export const useTool = () => {
  const context = useContext(ToolContext);
  if (!context) throw new Error('useTool must be used within ToolProvider');
  return context;
};
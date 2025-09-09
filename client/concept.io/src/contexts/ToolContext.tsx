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

type ToolContextType = {
    state: ToolState;
    dispatch: React.Dispatch<ToolAction>;
};

const ToolContext = createContext<ToolContextType>(null as unknown as ToolContextType);
ToolContext.displayName = 'ToolContext';

export const ToolProvider = ({children} : {children: ReactNode}) => {
    const [state, dispatch] = useReducer(toolReducer, initialState);

    const value: ToolContextType = {
        state,
        dispatch
    };

    return (
        <ToolContext.Provider value={value}>
            {children}
        </ToolContext.Provider>
    );
};

export const useTool = (): ToolContextType => {
    const toolContext = useContext(ToolContext);
    if (!toolContext) {
        throw new Error('useTool must be used within a ToolProvider');
    }
    return toolContext;

};
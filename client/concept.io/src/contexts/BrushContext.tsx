// import React, { createContext, useContext} from 'react';
// import {useBrush} from '../hooks/Brush';
// import * as fabric from 'fabric';

// const BrushContext = React.createContext<ReturnType<typeof useBrush> | null>(null);

// export const BrushProvider: React.FC<{children: React.ReactNode | null}> = ({children}) => {
//     const brushState = useBrush();
//     return (
//         <BrushContext.Provider value={brushState}>
//             {children}
//         </BrushContext.Provider>
//     );
// }

// export const useBrushContext = () => {
//     const context = useContext(BrushContext);
//     if (!context) {
//         throw new Error('useBrushContext must be used within a BrushProvider');
//     }
//     return context;
// }

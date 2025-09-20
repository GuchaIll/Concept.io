
import { useState } from "react";
export interface CustomBrush {
    name: string;
    size: number;
    hardness: number;
    texture: string; //link to the corresponding alpa   
    angleJitter: number;
    roundnessJitter: number;
    colorJitter: number;
    smoothing: number;
    noise: number;
    
}

//Custom brush extends from texture brush 

/**
 * @file   index.tsx
 * @brief  Intial component for the react app
 * @date   Feb , 2020
 * @author ZCO Engineer
 * @copyright (c) 2020, ZCO
 */
require("react-hot-loader/patch") 
import 'bootstrap/dist/css/bootstrap.min.css';

import * as React from 'react';
// import * as ReactDOM from 'react-dom';
import { AppContainer } from "react-hot-loader";
import Jewels from './components/jewels/Jewels';
import './index.css';
import { createRoot } from "react-dom/client";
const eventMethod = "addEventListener"
const eventer = window[eventMethod]
const messageEvent =  "message"
eventer(
    messageEvent, (e: any) => { 
const rootElement = document.getElementById("root") as HTMLElement;

if(!!rootElement) { 
const root = createRoot(rootElement);
      root.render(<AppContainer>
        <Jewels data={e.data}/>
      </AppContainer>);
}
},
false
)


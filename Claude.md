##Goal
Build a complete full-stake Idea brain-storming system on website with full functionality and integrate with Google's GenAI API services.

##Framework
React
Maintain a scalable, and good practive architecture


##Features
The main feature of this application will be thinking chain generation using Gemini models. 
User will input a topic that they want to brain storm about, then the website will render the topic wrapped in an element, and then with several possible related topic beside it. 

Example, If I input Business, then the system will generate with several option, like Fin Tech, Automation, Dropshipping, etc. Then user can choose which one he is more prefered, then he click that sub node, like FinTech, then the node will generate mode nodes related to FinTech but a extend thinking chain. Until finally user satisfied with all those linked node, then he can press generate, then the AI will help to generate with the content for him.

User can choose to regenerate or input, if none of the subnode meets user's requirement. 
User can also download the final output.
When Subnode is generated, make sure all nodes and their content is visible clearly.
When a new node is selected, other node must hide, and leave only the selected node and its parent node. with link in between them. Then the view position must always move to the current parent node to maintain the visible stability. like the current parent ndoe always at centre.
To ensure a GOOD UI UX, the subnode must not contain more than 5 words.


## Testing
Website start with a input text field, after input, node generated. 
sub note generated and clickable. 
Regenerate button and self input text field workable. 
Finally a full idea proposal generated. 

##API key: AIzaSyBsJJnKEEthTHff70kx3Npq7nR_UYwdbrg
Google's Gemini API key. 
Model selection: Gemini 3 Pro, Gemini 3 Flash.
Pro for generate final content, flash for instant generation of sub node.

## Example of using API key
https://ai.google.dev/gemini-api/docs


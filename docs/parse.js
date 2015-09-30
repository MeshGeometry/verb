var fs = require('fs')
    , path = require('path');

parse( path.join( __dirname, "../src/verb/geom/ISurface.hx") );  

function parse(srcfn){

    var input = fs.readFileSync( srcfn, "utf8" ); 
    
    var tokenStream = new TokenStream( input );
    var parser = new Parser( tokenStream );

    return parser.parse();
}

//
// An incomplete parser for Haxe that to aid in 
// constructing documentation
//

function Parser( tokenStream ){
   
    var debug = false;

    var currentToken, lastComment, types = [];
   
    function tokenMatchesAny( possibleTypes ){
        for(var i = 0; i < possibleTypes.length; i++) {
            if ( possibleTypes[i] === currentToken.type){ 
                return true;
            }
        }
    
        return false;
    }

    function consume( expectedType ){
        currentToken = tokenStream.consume();

        if (debug) console.log("currentToken", currentToken);

        if ( expectedType && !tokenMatchesAny( Array.prototype.slice.call(arguments) )){
            console.log(tokenStream.neighborhood());
            throw new Error(
                "Syntax Error - expectedType \"" + Array.prototype.join.call( arguments, ", ") + "\", but got \"" + currentToken.type + "\"" + "\n\n" +
                tokenStream.neighborhood() + "\n" +
                "          ^          "
            );
        } 

        return currentToken;
    }

    function peak(){
        return tokenStream.peak();
    }

    function parseExtends(){
        
        consume("extends");

        // get the type name
        var r = consume();
        return r.contents;
    }
   
    function parseIdList(){

        var idlist = []
            , peaked;

        do {
            consume();

            if ( currentToken.type === "id" ){
                idlist.push( currentToken.contents );
            }
        } while ( (peaked = peak()) && (peaked.type === "id" || peaked.type === ",") )

        return idlist;
    }

    function parseImplements(){
         
        consume("implements");
        return parseIdList();

    }

    function parseClass( visibility ){
      
        // get visibility from current token or default
        visibility = visibility || "public";
        
        consume("class");  
       
        // get the type name for the class
        var typeName = consume().contents;
    
        // build the class type
        var def = new Class( typeName, visibility ); 
    
        // set the description
        if (lastComment){
            def.description = lastComment 
        
            // don't reuse the lastComment
            lastComment = undefined;
        }

        var peaked = peak(); 

        // parent class
        if ( peaked.type === "extends" ){

            def.parentClass = parseExtends();
            
            // look further ahead
            peaked = peak();
        }
        
        // parse interfaces
        if ( peaked.type === "implements" ){
            def.interfaces = parseImplements();                       
        }
        
        parseClassBody( def );

        console.log(def);

        return def; 
    }

    function consumeBlock(){

        consume("{");
        var parenCount = 1;

        while ( parenCount != 0 ){
            consume();

            if (currentToken.type === "{") {
                parenCount++;
            } else if (currentToken.type === "}"){
                parenCount--;
            }
        }
    }

    function consumeIf(char){
        var peaked = peak();
        if (peaked.type === char) consume();
    }

    function consumeUntil(char){

        var peaked;
        while ( (peaked = peak()) && peaked.type != char ){
            consume();
        }

    }

    function consumeUntilInclusive(char){
        consumeUntil(char);
        consume(char);
    }

    function parseProperty( isStatic ){

        consume("var");

        var name = consume().contents;
        var type;

        var peaked = peak();
        
        if (peaked.type === ":"){
           
            consume(":");
            type = consume("id").contents; 
            peaked = peak();
            
        }

        consumeUntilInclusive(";");

        return new Property( name, type, isStatic ); 
    }
  
    function parseMethodArgument(){
    
        // id : Type = expression
        var name = consume("id").contents;
      
        var peaked = peak();

        var type;
        if (peaked.type === ":"){
            type = parseTypeAnnotation();
            peaked = peak();
        }

        var defaultVal;
        if (peaked.type === "="){    
            consume("=");
            defaultVal = consume("number", "string", "boolean", "null").contents; 
        }
    
        return new MethodArgument(name, type, defaultVal);
    }

    function parseMethodArguments(){

        // ( methodArgument, methodArgument )
        consume("(");

        var peaked, args = [];

        while ( (peaked = peak()) && peaked.type != ")"){
            
            if (peaked.type === "id"){
                args.push( parseMethodArgument() );
            } else if (peaked.type === ","){
                consume(","); // consume the ","
            } 

        }
       
        consume(")");
        return args;
    }

    function getLastComment(){

        var lc = lastComment;
        lastComment = undefined;
        return lc ? lc.contents : lc;

    }

    function parseTypeAnnotation(){

        consume(":");
        return consume("id").contents;

    }

    function parseMethod( isStatic ){
    
        // function MethodName( methodArgument, methodArgument ) : ExpectedType { ... } 
        consume("function");

        var name = consume("id", "new").contents;
        
        var args = parseMethodArguments();

        peaked = peak();
   
        var type;
        if (peaked.type === ":"){
           type = parseTypeAnnotation(); 
        }
    
        consumeBlock();

        return new Method( name, args, type, getLastComment() );
    }

    function parseClassMember( def, visibility ){

        // parse "public" or "private"
        var visibility = visibility ? visibility : consume("visibility").contents;     

        // hack to ignore private members
        if ( visibility === "private"){
            def = new Class();
        }

        var peaked = peak();
        var isStatic = false;
    
        if ( peaked.type === "static" ){
            isStatic = true;
            
            consume("static");
            peaked = peak();
        }

        if ( peaked.type === "var" ){
            return def.properties.push( parseProperty( isStatic ));
        } else if (peaked.type === "function"){
            return def.methods.push( parseMethod( isStatic )); 
        }

        throw new Error("Unknown class member encountered" + JSON.stringify( peaked ));
    }

    function parseClassBody( def ){

        consume("{");

        var peaked; 

        while ( (peaked = peak()) && peaked.type != "}"){
            if (peaked.type === "comment"){    
                parseComment();
                continue;
            } else if (peaked.type === "visibility"){
                parseClassMember( def );
                continue;
            } else if (peaked.type === "function"){
                parseClassMember( def, "private" );
                continue;
            } else if (peaked.type === "var"){
                parseClassMember( def, "private" );
                continue;
            } else if (peaked.type === "static"){
                parseClassMember( def, "private" );
                continue; 
            }

            consume();
        }

        consume("}");
    }

    function parseMethodDefinition(){
    
        // function MethodName( methodArgument, methodArgument ) : ExpectedType; 
        consume("function");

        var name = consume("id", "new").contents;
        
        var args = parseMethodArguments();

        peaked = peak();
   
        var type;
        if (peaked.type === ":"){
           type = parseTypeAnnotation(); 
        }
    
        consumeUntilInclusive(";");

        return new Method( name, args, type, getLastComment() );
    }

    function parseInterfaceMember( def, visibility ){

        // parse "public" or "private"
        var visibility = visibility ? visibility : consume("visibility").contents;     

        // hack to ignore private members
        if ( visibility === "private"){
            def = new Interface();
        }

        var peaked = peak();
    
        if ( peaked.type === "var" ){
            return def.properties.push( parseProperty());
        } else if (peaked.type === "function"){
            return def.methods.push( parseMethodDefinition()); 
        }

        throw new Error("Unknown interface member type encountered" + JSON.stringify( peaked ));
    }
    
    function parseInterfaceBody( def ){

        consume("{");

        var peaked; 

        while ( (peaked = peak()) && peaked.type != "}"){
            if (peaked.type === "comment"){    
                parseComment();
                continue;
            } else if (peaked.type === "visibility"){
                parseInterfaceMember( def );
                continue;
            } else if (peaked.type === "function"){
                parseInterfaceMember( def, "public" );
                continue;
            }  

            consume();
        }

        consume("}");
    }

    function parseInterface( visibility ){
      
        // get visibility from current token or default
        visibility = visibility || "public";
        
        consume("interface");  
       
        // get the type name for the class
        var typeName = consume().contents;
    
        // build the class type
        var def = new Interface( typeName, visibility ); 
    
        // set the description
        def.description = getLastComment();
        
        if ( peak().type === "implements" ){
            def.interfaces = parseImplements();                       
        }
        
        parseInterfaceBody( def );

        console.log( def );

        return def; 
    }

    function parseTypeDefinition(){ 
        var visibility = consume("visibility").contents;

        var peaked = peak();
        
        if (peaked.contents === "class"){
            return parseClass(); 
        } else if (peaked.contents === "interface"){
            return parseInterface(); 
        }

        throw new Error("Not implemented" + JSON.stringify( peaked ));    
    }

    function parseComment() {
        var squashed = consume("comment");

        while ( peak().type === "comment" ){
            currentToken = consume();
            
            squashed.contents += "\n";
            squashed.contents += currentToken.contents; 
        }
    
        return lastComment = squashed;
    }
    
    this.parse = () => {
       
        var peaked;

        while ( (peaked = peak()) ){
            if (peaked.type === "class"){
                types.push( parseClass() ); 
            } else if (peaked.type === "interface"){
                types.push( parseInterface() ); 
            } else if ( peaked.type === "visibility" ){
                types.push( parseTypeDefinition() ); 
            } else if (peaked.type === "comment"){
                parseComment();
            } else {
                consume();
            }
        }

        return types;
    }
}

function TokenStream( input ){

    // token state
    var i = 0;
    var peaking = false;
    var line = 1;
    var col = 0;

    // helpers
    var isNumeric = (c) => c === "." || c=== "+" || c === "-" || (c <= '9' && c >= '0');
    var isInnerNumeric = (c) => isNumeric(c) || c === "e" || c === "E";
    var isWhitespace = (c) => c === '\n' || c === '\t' || c === ' ';
    var isComment = (c) => c === '/';
    var isSeparator = (c) => c === ";" || c === "(" || c === ")" || c === "{" || c === "}" || c === "," || c === ":" || c === "="; 
    var isLineEnd = (c) => c === '\n';
    var isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    var make = (type, contents) => ({ type : type, contents : contents, line: line, col: col });
    var categorizeId = (s) => {

        if (s === "class"){
            return make(s,s);
        } else if (s === "interface") {
            return make(s,s);
        } else if (s === "true"){
            return make("boolean", s);
        } else if (s === "true"){
            return make("boolean", s);
        } else if (s === "private"){
            return make("visibility", s);
        } else if (s === "public"){
            return make("visibility", s);
        } else if (s === "extends"){
            return make(s,s);
        } else if (s === "implements"){
            return make(s,s);
        } else if (s === "typedef"){
            return make(s,s);
        } else if (s === "function"){
            return make(s,s);
        } else if (s === "static"){
            return make(s,s);
        } else if (s === "new"){
            return make(s,s);
        } else if (s === "null"){
            return make(s,s);
        } else if (s === "var"){
            return make(s,s);
        }

        return make("id", s); 
    };

    var inc = () => {
        if (!peaking){
            col++;

            if (input.charAt(i) === '\n'){
                line++;
                col = 0;
            } 
        }
        i++;
        return i;
    };

    // functions
    this.empty = () => i >= input.length;
    this.peak = () => {
        peaking = true;
        var m = i;
        var t = this.consume();
        i = m;
        peaking = false;
        return t;
    };
    this.neighborhood = () => {
        return input.slice(i-10, i+10);
    }
    this.consume = () => {
       
        var c = input.charAt(i);
        var s;

        while ( c ){
            
            s = "";
            c = input.charAt(i);
          
            // Separators
            if ( isSeparator( c ) ){
                
                inc();
                return make(c); 

            }
            // Numbers
            else if ( isNumeric( c ) ){
                
                while ( c && isNumeric(c) ){
                    s += c; 
                    c = input.charAt(inc()); 
                }

                return make("number", s);
            }
            // Name
            else if ( isAlpha(c) ){

                while ( c && !isWhitespace(c) && !isSeparator(c)){
                    s += c;
                    c = input.charAt(inc());
                }

                return categorizeId(s);

            // Comment
            } else if (isComment(c) && isComment(input.charAt(i+1))) {

                // trim comments
                while (isComment(input.charAt(i))){ inc() } 
                
                c = input.charAt(i);

                // consume comments
                while ( c && !isLineEnd(c) ){
                    s += c;
                    c = input.charAt(inc());
                }
                
                return make("comment", s);    

            }
       
            inc();
        }
            
        return null;
    }
}

function Method(name, args, returnType, description){
    this.name = name;
    this.description = description || "";
    this.args = args || [];
    this.returnType = returnType;
}

function MethodArgument(name, type, defaultValue){
    this.name = name;
    this.type = type;
    this.defaultValue = defaultValue;
}

function Property(name, type){
    this.name = name;
    this.type = type;
}

function Typedef(name){
    this.name = name;
}

function Enum(name, fields){
    this.name = name;
    this.fields = fields;
}

function Interface(name){
    this.name = name;
    this.description = "";
    this.methods = [];
}

function Class(name, visibility){
    this.visibility = visibility; 
    this.name = name;
    this.description = "";
    this.methods = [];
    this.parentClass = undefined;
    this.interfaces = [];
    this.properties = [];
}


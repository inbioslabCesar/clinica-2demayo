System.register([],function(t,r){"use strict";return{execute:function(){function r(t){return r="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(t){return typeof t}:function(t){return t&&"function"==typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},r(t)}t("p",function(t,o,i,f,c,u){if(!(isNaN(u)||u<1)){u|=0;var s=function(t,n,e,a,o){if("string"==typeof t&&(t=document.getElementById(t)),!t||"object"!==r(t)||!("getContext"in t))throw new TypeError("Expecting canvas with `getContext` method in processCanvasRGB(A) calls!");var i=t.getContext("2d");try{return i.getImageData(n,e,a,o)}catch(f){throw new Error("unable to access image data: "+f)}}(t,o,i,f,c);s=function(t,r,o,i,f,c){for(var u,s=t.data,g=2*c+1,v=i-1,l=f-1,b=c+1,y=b*(b+1)/2,x=new a,m=x,p=1;p<g;p++)m=m.next=new a,p===b&&(u=m);m.next=x;for(var h=null,w=null,d=0,C=0,S=n[c],E=e[c],I=0;I<f;I++){m=x;for(var B=s[C],D=s[C+1],N=s[C+2],T=s[C+3],j=0;j<b;j++)m.r=B,m.g=D,m.b=N,m.a=T,m=m.next;for(var A=0,G=0,R=0,k=0,q=b*B,z=b*D,F=b*N,H=b*T,J=y*B,K=y*D,L=y*N,M=y*T,O=1;O<b;O++){var P=C+((v<O?v:O)<<2),Q=s[P],U=s[P+1],V=s[P+2],W=s[P+3],X=b-O;J+=(m.r=Q)*X,K+=(m.g=U)*X,L+=(m.b=V)*X,M+=(m.a=W)*X,A+=Q,G+=U,R+=V,k+=W,m=m.next}h=x,w=u;for(var Y=0;Y<i;Y++){var Z=M*S>>>E;if(s[C+3]=Z,0!==Z){var $=255/Z;s[C]=(J*S>>>E)*$,s[C+1]=(K*S>>>E)*$,s[C+2]=(L*S>>>E)*$}else s[C]=s[C+1]=s[C+2]=0;J-=q,K-=z,L-=F,M-=H,q-=h.r,z-=h.g,F-=h.b,H-=h.a;var _=Y+c+1;_=d+(_<v?_:v)<<2,J+=A+=h.r=s[_],K+=G+=h.g=s[_+1],L+=R+=h.b=s[_+2],M+=k+=h.a=s[_+3],h=h.next;var tt=w,rt=tt.r,nt=tt.g,et=tt.b,at=tt.a;q+=rt,z+=nt,F+=et,H+=at,A-=rt,G-=nt,R-=et,k-=at,w=w.next,C+=4}d+=i}for(var ot=0;ot<i;ot++){var it=s[C=ot<<2],ft=s[C+1],ct=s[C+2],ut=s[C+3],st=b*it,gt=b*ft,vt=b*ct,lt=b*ut,bt=y*it,yt=y*ft,xt=y*ct,mt=y*ut;m=x;for(var pt=0;pt<b;pt++)m.r=it,m.g=ft,m.b=ct,m.a=ut,m=m.next;for(var ht=i,wt=0,dt=0,Ct=0,St=0,Et=1;Et<=c;Et++){C=ht+ot<<2;var It=b-Et;bt+=(m.r=it=s[C])*It,yt+=(m.g=ft=s[C+1])*It,xt+=(m.b=ct=s[C+2])*It,mt+=(m.a=ut=s[C+3])*It,St+=it,wt+=ft,dt+=ct,Ct+=ut,m=m.next,Et<l&&(ht+=i)}C=ot,h=x,w=u;for(var Bt=0;Bt<f;Bt++){var Dt=C<<2;s[Dt+3]=ut=mt*S>>>E,ut>0?(ut=255/ut,s[Dt]=(bt*S>>>E)*ut,s[Dt+1]=(yt*S>>>E)*ut,s[Dt+2]=(xt*S>>>E)*ut):s[Dt]=s[Dt+1]=s[Dt+2]=0,bt-=st,yt-=gt,xt-=vt,mt-=lt,st-=h.r,gt-=h.g,vt-=h.b,lt-=h.a,Dt=ot+((Dt=Bt+b)<l?Dt:l)*i<<2,bt+=St+=h.r=s[Dt],yt+=wt+=h.g=s[Dt+1],xt+=dt+=h.b=s[Dt+2],mt+=Ct+=h.a=s[Dt+3],h=h.next,st+=it=w.r,gt+=ft=w.g,vt+=ct=w.b,lt+=ut=w.a,St-=it,wt-=ft,dt-=ct,Ct-=ut,w=w.next,C+=i}}return t}(s,0,0,f,c,u),t.getContext("2d").putImageData(s,o,i)}});
/**
      * StackBlur - a fast almost Gaussian Blur For Canvas
      *
      * In case you find this class useful - especially in commercial projects -
      * I am not totally unhappy for a small donation to my PayPal account
      * mario@quasimondo.de
      *
      * Or support me on flattr:
      * {@link https://flattr.com/thing/72791/StackBlur-a-fast-almost-Gaussian-Blur-Effect-for-CanvasJavascript}.
      *
      * @module StackBlur
      * @author Mario Klingemann
      * Contact: mario@quasimondo.com
      * Website: {@link http://www.quasimondo.com/StackBlurForCanvas/StackBlurDemo.html}
      * Twitter: @quasimondo
      *
      * @copyright (c) 2010 Mario Klingemann
      *
      * Permission is hereby granted, free of charge, to any person
      * obtaining a copy of this software and associated documentation
      * files (the "Software"), to deal in the Software without
      * restriction, including without limitation the rights to use,
      * copy, modify, merge, publish, distribute, sublicense, and/or sell
      * copies of the Software, and to permit persons to whom the
      * Software is furnished to do so, subject to the following
      * conditions:
      *
      * The above copyright notice and this permission notice shall be
      * included in all copies or substantial portions of the Software.
      *
      * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
      * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
      * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
      * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
      * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
      * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
      * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
      * OTHER DEALINGS IN THE SOFTWARE.
      */
var n=[512,512,456,512,328,456,335,512,405,328,271,456,388,335,292,512,454,405,364,328,298,271,496,456,420,388,360,335,312,292,273,512,482,454,428,405,383,364,345,328,312,298,284,271,259,496,475,456,437,420,404,388,374,360,347,335,323,312,302,292,282,273,265,512,497,482,468,454,441,428,417,405,394,383,373,364,354,345,337,328,320,312,305,298,291,284,278,271,265,259,507,496,485,475,465,456,446,437,428,420,412,404,396,388,381,374,367,360,354,347,341,335,329,323,318,312,307,302,297,292,287,282,278,273,269,265,261,512,505,497,489,482,475,468,461,454,447,441,435,428,422,417,411,405,399,394,389,383,378,373,368,364,359,354,350,345,341,337,332,328,324,320,316,312,309,305,301,298,294,291,287,284,281,278,274,271,268,265,262,259,257,507,501,496,491,485,480,475,470,465,460,456,451,446,442,437,433,428,424,420,416,412,408,404,400,396,392,388,385,381,377,374,370,367,363,360,357,354,350,347,344,341,338,335,332,329,326,323,320,318,315,312,310,307,304,302,299,297,294,292,289,287,285,282,280,278,275,273,271,269,267,265,263,261,259],e=[9,11,12,13,13,14,14,15,15,15,15,16,16,16,16,17,17,17,17,17,17,17,18,18,18,18,18,18,18,18,18,19,19,19,19,19,19,19,19,19,19,19,19,19,19,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24],a=function t(){!function(t,r){if(!(t instanceof r))throw new TypeError("Cannot call a class as a function")}(this,t),this.r=0,this.g=0,this.b=0,this.a=0,this.next=null}}}});

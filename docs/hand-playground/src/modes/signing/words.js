// ~1000 common English words, roughly most-common first (hand-written list, no licence strings).
export default `the be to of and a in that have i it for not on with he as you do at this but his by from they we say her
she or an will my one all would there their what so up out if about who get which go me when make can like time no just him
know take people into year your good some could them see other than then now look only come its over think also back after use
two how our work first well way even new want because any these give day most us is was are were been has had did said went
made got came took saw knew thought told found gave hello hi hey yes yeah okay ok thanks thank please sorry love name friend
family mom dad mother father sister brother baby child children kid boy girl man woman men women person home house room school
class teacher student book read write draw sign language hand hands finger face eye eyes ear head heart body water food eat drink
milk coffee tea juice bread apple banana pizza cake cookie candy dinner lunch breakfast morning night today tomorrow yesterday week
month hour minute second soon late early always never sometimes often again still here where why yes help stop start open close
play game fun happy sad angry tired sick hungry thirsty cold hot warm cool nice bad great best better big small little long short
tall old young fast slow easy hard right left wrong true false same different more less many much few every each both all none
something nothing anything everything someone everyone nobody inside outside under above near far next last before after during
between around with without again very really too also only just maybe please welcome goodbye bye night sleep wake dream walk run
jump sit stand dance sing laugh cry smile talk speak listen hear watch look see feel touch hold carry bring buy sell pay cost money
car bus train plane bike boat road street city town country world earth sun moon star sky rain snow wind cloud tree flower grass
dog cat bird fish horse cow pig duck bear lion tiger monkey rabbit mouse animal pet color red blue green yellow orange purple pink
black white brown gray number one two three four five six seven eight nine ten hundred thousand first second third phone computer
music song movie picture photo video camera light dark door window table chair bed floor wall kitchen bathroom garden park store
shop market hospital doctor nurse police fire work job office boss team group party birthday gift present holiday summer winter
spring fall autumn weather question answer idea problem reason story news word letter alphabet line page paper pen pencil art
science math history english spanish french learn teach study practice test quiz homework understand remember forget believe hope
wish need wait try finish begin end win lose find keep let put set turn show call ask meet leave stay live die kill save share
send tell show move change grow build cut clean wash cook fix break drive ride fly swim climb throw catch kick push pull pick drop
fill open close lock enter exit arrive return follow lead join visit travel explore enjoy miss worry care mind matter mean seem
become happen appear allow agree argue decide choose plan prepare expect imagine notice wonder guess check count measure compare
ready sure free busy safe dangerous careful quiet loud clear dirty clean full empty heavy light rich poor strong weak smart funny
kind mean brave shy proud lucky beautiful pretty ugly cute sweet sour salty bitter fresh wet dry soft sharp smooth rough round
square flat deep high low wide narrow thick thin quick simple real fake important special normal strange famous popular public
private whole half part piece side top bottom front middle end edge corner center place space area point level size shape type
kind sort example fact thing stuff way life death health mind body soul power energy force heat sound noise voice air ground land
sea ocean river lake mountain hill island beach forest desert field farm village office bank church museum library airport station
hotel restaurant cafe bar club gym pool zoo beach map plan trip vacation ticket passport key bag box cup glass plate bowl fork knife
spoon bottle shirt pants dress shoe shoes hat coat jacket sock sweater watch ring clock bell toy ball doll robot rocket planet space
magic dragon king queen prince princess hero monster ghost zombie pirate ninja wizard castle treasure adventure secret surprise
awesome amazing cool wow yay oops ouch hmm uh oh ha lol omg bruh dude bro guys yall
`.trim().split(/\s+/).filter((w, i, a) => a.indexOf(w) === i);

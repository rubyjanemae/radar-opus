#!/usr/bin/env node
/**
 * Builds public/data/families.json: an editorial remedy classification (kingdoms,
 * botanical orders and families, periodic table series and salts, zoological classes,
 * nosode types, themes) for the remedies in public/data/remedies.json.
 *
 * EDITORIAL CLASSIFICATION. Every assignment below comes from the explicit, auditable
 * tables in this file, written from general botanical (APG IV), zoological and chemical
 * knowledge of the Latin remedy names. Nothing is copied from any proprietary family
 * or kingdom list (Synthesis, RadarOpus families, Scholten, Sankaran …).
 *
 * Usage: node scripts/build-families.mjs [--report]
 *   --report  prints the unclassified remedies and per-kingdom counts.
 *
 * Resolution order per remedy (first hit wins for the primary classification):
 *   1. FULL      exact full-name overrides (lower-case name)
 *   2. word lists keyed by the first word of the name (plant family, animal, fungus,
 *      nosode, sarcode, imponderable, other)
 *   3. acid rule  "<x>icum Acidum" / "Acidum <x>" → mineral acid or organic acid
 *   4. mineral parser: first word is an element word → element + anion salts
 *   5. patterns  (spa waters "… Aqua", "… Nosode")
 * Themes (sea remedies, alkaloids) are added on top.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPORT = process.argv.includes('--report')
const words = s => s.trim().split(/\s+/).filter(Boolean)

// ─────────────────────────────── plants ───────────────────────────────

/** APG IV order → higher clade. */
const ORDER_CLADE = {
  // algae, bryophytes, lycophytes and ferns
  Fucales: 'algae', Vaucheriales: 'algae', Ceramiales: 'algae',
  Polytrichales: 'bryophytes',
  Lycopodiales: 'lycophytes', Selaginellales: 'lycophytes',
  Equisetales: 'ferns', Polypodiales: 'ferns',
  // gymnosperms
  Cycadales: 'gymnosperms', Ginkgoales: 'gymnosperms', Pinales: 'gymnosperms', Araucariales: 'gymnosperms', Cupressales: 'gymnosperms', Gnetales: 'gymnosperms',
  // early angiosperms & magnoliids
  Nymphaeales: 'basal', Austrobaileyales: 'basal',
  Magnoliales: 'magnoliids', Laurales: 'magnoliids', Piperales: 'magnoliids', Canellales: 'magnoliids',
  // monocots
  Acorales: 'monocots', Alismatales: 'monocots', Dioscoreales: 'monocots', Liliales: 'monocots', Asparagales: 'monocots', Arecales: 'monocots',
  Commelinales: 'monocots', Zingiberales: 'monocots', Poales: 'monocots',
  // eudicots
  Ranunculales: 'eudicots', Proteales: 'eudicots', Buxales: 'eudicots', Gunnerales: 'eudicots',
  Saxifragales: 'eudicots', Vitales: 'eudicots', Zygophyllales: 'eudicots', Fabales: 'eudicots', Rosales: 'eudicots',
  Fagales: 'eudicots', Cucurbitales: 'eudicots', Celastrales: 'eudicots', Oxalidales: 'eudicots', Malpighiales: 'eudicots',
  Geraniales: 'eudicots', Myrtales: 'eudicots', Sapindales: 'eudicots', Crossosomatales: 'eudicots', Malvales: 'eudicots', Brassicales: 'eudicots',
  Santalales: 'eudicots', Caryophyllales: 'eudicots', Cornales: 'eudicots', Ericales: 'eudicots', Icacinales: 'eudicots',
  Gentianales: 'eudicots', Boraginales: 'eudicots', Solanales: 'eudicots', Lamiales: 'eudicots', Aquifoliales: 'eudicots',
  Asterales: 'eudicots', Dipsacales: 'eudicots', Apiales: 'eudicots',
}
const CLADE_NAMES = {
  algae: 'Algae (seaweeds)', bryophytes: 'Mosses', lycophytes: 'Club mosses', ferns: 'Ferns & horsetails',
  gymnosperms: 'Gymnosperms (conifers & allies)', basal: 'Early flowering plants', magnoliids: 'Magnoliids',
  monocots: 'Monocots', eudicots: 'Eudicots',
}
const CLADE_ORDER = ['algae', 'bryophytes', 'lycophytes', 'ferns', 'gymnosperms', 'basal', 'magnoliids', 'monocots', 'eudicots']

/** Family → APG IV order. */
const FAMILY_ORDER = {
  Fucaceae: 'Fucales', Vaucheriaceae: 'Vaucheriales', Rhodomelaceae: 'Ceramiales',
  Polytrichaceae: 'Polytrichales', Lycopodiaceae: 'Lycopodiales', Selaginellaceae: 'Selaginellales',
  Equisetaceae: 'Equisetales', Dryopteridaceae: 'Polypodiales', Polypodiaceae: 'Polypodiales', Aspleniaceae: 'Polypodiales',
  Zamiaceae: 'Cycadales', Ginkgoaceae: 'Ginkgoales', Pinaceae: 'Pinales', Araucariaceae: 'Araucariales',
  Cupressaceae: 'Cupressales', Taxaceae: 'Cupressales', Ephedraceae: 'Gnetales',
  Nymphaeaceae: 'Nymphaeales', Schisandraceae: 'Austrobaileyales',
  Magnoliaceae: 'Magnoliales', Annonaceae: 'Magnoliales', Myristicaceae: 'Magnoliales',
  Lauraceae: 'Laurales', Monimiaceae: 'Laurales', Hernandiaceae: 'Laurales',
  Piperaceae: 'Piperales', Aristolochiaceae: 'Piperales', Saururaceae: 'Piperales', Canellaceae: 'Canellales',
  Acoraceae: 'Acorales', Araceae: 'Alismatales', Alismataceae: 'Alismatales',
  Nartheciaceae: 'Dioscoreales', Dioscoreaceae: 'Dioscoreales',
  Melanthiaceae: 'Liliales', Liliaceae: 'Liliales', Colchicaceae: 'Liliales', Smilacaceae: 'Liliales',
  Asparagaceae: 'Asparagales', Amaryllidaceae: 'Asparagales', Iridaceae: 'Asparagales', Orchidaceae: 'Asparagales', Asphodelaceae: 'Asparagales',
  Arecaceae: 'Arecales',
  Haemodoraceae: 'Commelinales', Commelinaceae: 'Commelinales', Pontederiaceae: 'Commelinales',
  Musaceae: 'Zingiberales', Zingiberaceae: 'Zingiberales', Cannaceae: 'Zingiberales',
  Poaceae: 'Poales', Juncaceae: 'Poales', Cyperaceae: 'Poales', Typhaceae: 'Poales',
  Ranunculaceae: 'Ranunculales', Berberidaceae: 'Ranunculales', Papaveraceae: 'Ranunculales', Menispermaceae: 'Ranunculales',
  Platanaceae: 'Proteales', Buxaceae: 'Buxales', Gunneraceae: 'Gunnerales',
  Saxifragaceae: 'Saxifragales', Crassulaceae: 'Saxifragales', Grossulariaceae: 'Saxifragales', Paeoniaceae: 'Saxifragales',
  Penthoraceae: 'Saxifragales', Altingiaceae: 'Saxifragales', Hamamelidaceae: 'Saxifragales',
  Vitaceae: 'Vitales', Zygophyllaceae: 'Zygophyllales', Krameriaceae: 'Zygophyllales',
  Fabaceae: 'Fabales', Polygalaceae: 'Fabales', Quillajaceae: 'Fabales',
  Rosaceae: 'Rosales', Rhamnaceae: 'Rosales', Ulmaceae: 'Rosales', Cannabaceae: 'Rosales', Moraceae: 'Rosales', Urticaceae: 'Rosales',
  Fagaceae: 'Fagales', Betulaceae: 'Fagales', Juglandaceae: 'Fagales', Myricaceae: 'Fagales',
  Cucurbitaceae: 'Cucurbitales', Corynocarpaceae: 'Cucurbitales', Coriariaceae: 'Cucurbitales', Celastraceae: 'Celastrales', Oxalidaceae: 'Oxalidales',
  Euphorbiaceae: 'Malpighiales', Phyllanthaceae: 'Malpighiales', Salicaceae: 'Malpighiales', Violaceae: 'Malpighiales',
  Passifloraceae: 'Malpighiales', Hypericaceae: 'Malpighiales', Clusiaceae: 'Malpighiales', Linaceae: 'Malpighiales',
  Achariaceae: 'Malpighiales', Erythroxylaceae: 'Malpighiales', Malpighiaceae: 'Malpighiales', Ochnaceae: 'Malpighiales',
  Dichapetalaceae: 'Malpighiales',
  Geraniaceae: 'Geraniales', Melianthaceae: 'Geraniales', Aphloiaceae: 'Crossosomatales',
  Onagraceae: 'Myrtales', Lythraceae: 'Myrtales', Myrtaceae: 'Myrtales', Melastomataceae: 'Myrtales', Combretaceae: 'Myrtales',
  Anacardiaceae: 'Sapindales', Sapindaceae: 'Sapindales', Rutaceae: 'Sapindales', Meliaceae: 'Sapindales',
  Simaroubaceae: 'Sapindales', Burseraceae: 'Sapindales', Nitrariaceae: 'Sapindales',
  Malvaceae: 'Malvales', Thymelaeaceae: 'Malvales', Cistaceae: 'Malvales', Dipterocarpaceae: 'Malvales', Bixaceae: 'Malvales',
  Brassicaceae: 'Brassicales', Capparaceae: 'Brassicales', Cleomaceae: 'Brassicales', Caricaceae: 'Brassicales',
  Tropaeolaceae: 'Brassicales', Pentadiplandraceae: 'Brassicales',
  Santalaceae: 'Santalales', Olacaceae: 'Santalales', Balanophoraceae: 'Santalales', Loranthaceae: 'Santalales',
  Caryophyllaceae: 'Caryophyllales', Amaranthaceae: 'Caryophyllales', Polygonaceae: 'Caryophyllales', Phytolaccaceae: 'Caryophyllales',
  Petiveriaceae: 'Caryophyllales', Cactaceae: 'Caryophyllales', Plumbaginaceae: 'Caryophyllales', Droseraceae: 'Caryophyllales',
  Nepenthaceae: 'Caryophyllales', Nyctaginaceae: 'Caryophyllales', Tamaricaceae: 'Caryophyllales',
  Cornaceae: 'Cornales', Hydrangeaceae: 'Cornales',
  Ericaceae: 'Ericales', Primulaceae: 'Ericales', Sarraceniaceae: 'Ericales', Theaceae: 'Ericales', Ebenaceae: 'Ericales', Balsaminaceae: 'Ericales', Polemoniaceae: 'Ericales',
  Icacinaceae: 'Icacinales',
  Rubiaceae: 'Gentianales', Gentianaceae: 'Gentianales', Apocynaceae: 'Gentianales', Loganiaceae: 'Gentianales', Gelsemiaceae: 'Gentianales',
  Boraginaceae: 'Boraginales',
  Solanaceae: 'Solanales', Convolvulaceae: 'Solanales',
  Lamiaceae: 'Lamiales', Plantaginaceae: 'Lamiales', Scrophulariaceae: 'Lamiales', Oleaceae: 'Lamiales', Verbenaceae: 'Lamiales',
  Bignoniaceae: 'Lamiales', Acanthaceae: 'Lamiales', Orobanchaceae: 'Lamiales', Pedaliaceae: 'Lamiales', Phrymaceae: 'Lamiales',
  Aquifoliaceae: 'Aquifoliales',
  Asteraceae: 'Asterales', Campanulaceae: 'Asterales', Menyanthaceae: 'Asterales',
  Adoxaceae: 'Dipsacales', Caprifoliaceae: 'Dipsacales',
  Apiaceae: 'Apiales', Araliaceae: 'Apiales',
}

/** Botanical family → first words (lower-case, punctuation stripped) of remedy names. Alkaloids and other isolates are filed with their source plant. */
const PLANT_FAMILY_WORDS = {
  Fucaceae: 'fucus',
  Vaucheriaceae: 'vaucheria',
  Rhodomelaceae: 'gelatina', // Gelatina helmintochorti: Alsidium helminthochorton (red alga)
  Polytrichaceae: 'polytrichum',
  Lycopodiaceae: 'lycopodium',
  Selaginellaceae: 'selaginella',
  Equisetaceae: 'equisetum',
  Dryopteridaceae: 'filix dryopteris panna',
  Polypodiaceae: 'calaguala',
  Aspleniaceae: 'scolopendrium',
  Zamiaceae: 'macroziama',
  Ginkgoaceae: 'ginkgo',
  Pinaceae: 'abies pinus larix pseudotsuga pix terebinthiniae terebenum terpini',
  Araucariaceae: 'agathis',
  Cupressaceae: 'cupressus juniperus sabina thuja sequoia',
  Taxaceae: 'taxus',
  Ephedraceae: 'ephedra ephedrinum',
  Nymphaeaceae: 'nuphar nymphaea',
  Schisandraceae: 'anisum',
  Magnoliaceae: 'magnolia',
  Annonaceae: 'asimina xylopia guatteria elemuy',
  Myristicaceae: 'myristica',
  Lauraceae: 'camphora camphoricum camphorated cinnamomum oreodaphne oxeodaphne persea sassafras coto benzoinoderiferum',
  Monimiaceae: 'boldo xymalos',
  Hernandiaceae: 'hernandia',
  Piperaceae: 'piper cubeba matico',
  Aristolochiaceae: 'aristolochia asarum serpentaria',
  Saururaceae: 'saururus anemopsis',
  Canellaceae: 'cinnamodendron',
  Acoraceae: 'calamus',
  Araceae: 'arum caladium ictodes lemna amorphophallus',
  Alismataceae: 'alisma',
  Nartheciaceae: 'aletris',
  Dioscoreaceae: 'dioscorea tamus rajania',
  Melanthiaceae: 'helonias heloninum paris sabadilla trillium veratrum veratrinum xerophyllum',
  Liliaceae: 'lilium',
  Colchicaceae: 'colchicum colchicinum gloriosa',
  Smilacaceae: 'sarsaparilla smilacinum chopheenee',
  Asparagaceae: 'agave agraphis asparagus convallaria ornithogalum squilla yucca ruscus',
  Amaryllidaceae: 'allium galanthus narcissus',
  Iridaceae: 'iris irisin crocus sisyrinchium homeria',
  Orchidaceae: 'cypripedium spiranthes corallorhiza dipodium vanilla vanillin',
  Asphodelaceae: 'aloe xanthorrhoea phormium',
  Arecaceae: 'sabal areca elaeis phoenix',
  Haemodoraceae: 'lachnanthes',
  Commelinaceae: 'tradescantia',
  Pontederiaceae: 'eichornia',
  Musaceae: 'musa',
  Zingiberaceae: 'zingiber curcuma galanga',
  Cannaceae: 'canna',
  Poaceae: 'anthoxanthum anantherum arundo avena bambusa bromus cynodon dactylis lolium oryza phleum saccharum triticum zea stigmata andropogon cymbopogon agrostis furfur',
  Juncaceae: 'juncus',
  Cyperaceae: 'scirpus',
  Typhaceae: 'typha',
  Ranunculaceae: 'aconitum aconitinum aconiticum actaea adonis adonidinum aquilegia caltha cimicifuga macrotin clematis delphininum eranthis helleborus hepatica hydrastis xanthorrhiza hydrastininum hydrastinum pulsatilla ranunculus staphysagria thalictrum nigella',
  Berberidaceae: 'berberis berberinum caulophyllum podophyllum podophyllinum',
  Papaveraceae: 'apomorphinum argemone agremone chelidonium chelidoninum corydalis cryptopinum eschscholtzia fumaria adlumia opium morphinum codeinum narcotinum narceinum meconinum papaverinum papaver thebainum heroinum sanguinaria sanguinarinum',
  Menispermaceae: 'cocculus menispermum pareira picrotoxinum cissampelos triclisia tinospora',
  Platanaceae: 'platanus platan',
  Buxaceae: 'buxus',
  Gunneraceae: 'gunnera',
  Saxifragaceae: 'heuchera saxifraga',
  Crassulaceae: 'sedum sempervivum cotyledon kalanchoe bryophyllum crassula',
  Grossulariaceae: 'ribes',
  Paeoniaceae: 'paeonia',
  Penthoraceae: 'penthorum',
  Altingiaceae: 'altingia',
  Hamamelidaceae: 'hamamelis',
  Vitaceae: 'vitis ampelopsis cissus',
  Zygophyllaceae: 'guajacum tribulus',
  Krameriaceae: 'ratanhia',
  Nitrariaceae: 'peganum',
  Fabaceae: 'albizzia alfalfa chrysarobinum santalinus anagyris aragallus astragalus baptisia balsamum caesalpinia cajanus calliandra cassia cercis copaiva coronilla cytisus cytisinum derris desmodium dolichos elephantorhiza eriosema erythrina erythrophlaeum eysenhardtia galega genista geoffroya glycyrrhiza gymnocladus haematoxylon hedysarum indigo indigofera jequiritol jonesia lathyrus lespedeza melilotus mimosa mucuna neorautanenia ononis oxytropis pambotano pentaclethra phaseolus phase physostigma eserinum piliostigma piscidia psoralea robinia sarothamnus schotia senna spartium spartheinum sparteinum tamarindus tephrosia tongo trifolium ulex wisteria',
  Polygalaceae: 'senega securidaca',
  Quillajaceae: 'quillaya',
  Rosaceae: 'agrimonia amygdalus crataegus cydonia fragaria geum kousso laurocerasus malus phloridzinum potentilla prunus pyrus rosa rubus sanguisorba sorbus spiraea',
  Rhamnaceae: 'ceanothus cascara rhamnus gouania karwinskia helinus zizyphus',
  Ulmaceae: 'ulmus',
  Cannabaceae: 'cannabis lupulus lupulinum celtis trema',
  Moraceae: 'ficus brosimum',
  Urticaceae: 'urtica parietaria cecropia musanga',
  Fagaceae: 'castanea fagus quercus galla',
  Betulaceae: 'alnus betula carpinus ostrya',
  Juglandaceae: 'juglans juglandinum carya',
  Myricaceae: 'myrica',
  Cucurbitaceae: 'bryonia colocynthis colocynthinum cucurbita cucumis elaterium luffa momordica coccinia cephalandra trychosanthes trichosanthes',
  Corynocarpaceae: 'karaka',
  Coriariaceae: 'coriaria',
  Celastraceae: 'euonymus elaeodendron',
  Oxalidaceae: 'oxalis',
  Euphorbiaceae: 'acalypha alchornea cascarilla cassada croton euphorbium euphorbia golondrina hura jatropha kamala mancinella mercurialis ricinus ricinodendron semen spirostachys stillingia synadenium',
  Phyllanthaceae: 'phyllanthus bridelia hymenocardia maesobotrya embelica',
  Salicaceae: 'salix salicinum populus dovyalis trimeria',
  Violaceae: 'viola',
  Passifloraceae: 'passiflora turnera',
  Hypericaceae: 'hypericum harungana',
  Clusiaceae: 'gambogia',
  Linaceae: 'linum',
  Achariaceae: 'chaulmo gynocardia',
  Erythroxylaceae: 'coca cocainum',
  Malpighiaceae: 'banisteria galphimia',
  Ochnaceae: 'ochna',
  Dichapetalaceae: 'dichapetalum',
  Geraniaceae: 'geranium erodium pelargonium monsonia',
  Melianthaceae: 'bersama',
  Aphloiaceae: 'aphloia',
  Onagraceae: 'epilobium oenothera',
  Lythraceae: 'granatum pelletierinum cupheavis',
  Myrtaceae: 'angophora cajuputum eucalyptus eucalyptolum eugenia kino melaleuca myrtus pimenta psidium syzygium',
  Melastomataceae: 'melastoma dissotis heterotis',
  Combretaceae: 'combretum terminalia',
  Anacardiaceae: 'anacardium comocladia mangifera rhus schinusmolle sclerocarya',
  Sapindaceae: 'acer aesculus negundium paullinia cardiospermum sapindus',
  Rutaceae: 'aegle angustura barosma clausena citrus aurantii dictamnus diosma jaborandi pilocarpinum ptelea ruta toddalia xantoxylum zanthoxylum atista',
  Meliaceae: 'azadirachta carapa ekebergia guarea trichilia turraea',
  Simaroubaceae: 'ailanthus brucea castella cedron chaparro quassia simaruba',
  Burseraceae: 'olibanum balsamodendron',
  Malvaceae: 'abelmoschus abroma althaea cacao gossypium grewia hibiscus kola sida sterculia tilia triumfetta',
  Thymelaeaceae: 'daphne dirca mezereum',
  Cistaceae: 'cistus helianthemum',
  Dipterocarpaceae: 'dipterocarpus',
  Bixaceae: 'bixa',
  Brassicaceae: 'brassica bunias cheiranthus cochlearia iberis lepidium lobularia matthiola nasturtium raphanistrum raphanus sinapis thlaspi vesicaria',
  Capparaceae: 'capparis',
  Cleomaceae: 'cleome',
  Caricaceae: 'carica',
  Tropaeolaceae: 'tropaeolum',
  Pentadiplandraceae: 'pentadiplandra',
  Santalaceae: 'santalum viscum guipsinum okoubaka',
  Olacaceae: 'ximenia liriosma',
  Balanophoraceae: 'flor',
  Caryophyllaceae: 'agrostema arenaria drymaria herniaria illecebrum paronychia saponaria scleranthus stellaria',
  Amaranthaceae: 'achyranthes amaranthus atriplex beta celosia chenopodium cyathula',
  Polygonaceae: 'fagopyrum lapathum polygonum rheum rumex',
  Phytolaccaceae: 'phytolacca',
  Petiveriaceae: 'petiveria',
  Cactaceae: 'anhalonium cactus cactinum carnegia cereus opuntia opun',
  Plumbaginaceae: 'plumbago ceratostigma',
  Droseraceae: 'drosera',
  Nepenthaceae: 'nepenthes',
  Nyctaginaceae: 'boerhavia bougenville mirabilis',
  Tamaricaceae: 'tamarix',
  Cornaceae: 'cornus',
  Hydrangeaceae: 'hydrangea',
  Ericaceae: 'arbutus arbutinum chimaphila epigea erica gaultheria kalmia ledum monotropa oxydendron rhododendron uva vaccinium',
  Primulaceae: 'anagallis androsace cyclamen embelia hottonia lysimachia maesa primula',
  Sarraceniaceae: 'sarracenia',
  Polemoniaceae: 'hoitzia',
  Theaceae: 'thea theinum',
  Ebenaceae: 'euclea royena',
  Balsaminaceae: 'impatiens',
  Icacinaceae: 'pyrenacantha',
  Rubiaceae: 'asperula cainca caffeine coffeinum cephalanthus china chininum chinidinum cinchona cinchoninum coffea craterispermum emetinum galium gardenia heinsia ipecacuanha mitchella mitragyna morinda nauclea oldenlandia plectronia quinidinum rubia spermacoce uncaria vangueria yohimbinum',
  Gentianaceae: 'canchalagua gentiana sabbatia',
  Apocynaceae: 'alstonia apocynum asclepias aspidospermium calotropis carissa chlorocodon craspidospermum cundurango cymarinum echites gomphocarpus gymnema hemidesmus kurchi oleander ouabainum periploca quebracho rauwolfia reserpinum stapelia strophanthus tabernaemontana tanghinia thevetia toxicophloea tylophora uzara vinca vincetoxicum voacanga',
  Loganiaceae: 'brucinum curare ignatia spigelia strychninum strychinum strychnos upas',
  Gelsemiaceae: 'gelsemium',
  Boraginaceae: 'borago cynoglossum heliotropium hydrophyllum myosotis onosmodium pulmonaria symphytum yerba eriodyction',
  Solanaceae: 'atropinum belladonna capsicum datura daturinum duboisia duboisinum dulcamara fabiana franciscea hyoscin hyoscyaminum hyoscyamus lycopersicon mandragora nicotine physalis scopola scopolaminum scopolia solaninum solanum stramonium tabacum withania',
  Convolvulaceae: 'convolvulus ipomoea jalapa operculina scammonium',
  Lamiaceae: 'agnus cataria chamaedrys clerodendron coleus collinsonia galeopsis glechonia hedeoma hyptis hyssopus lamium lavandula leonotis leonurus leucas lycopus marrubium melissa mentha mentholum micromeria moschosma ocimum origanum orthosiphon plectranthus prunella pycnostachys rosmarinus salvia scutellaria stachys tetradenia teucrium thymolum thymus vitex',
  Plantaginaceae: 'chelone digitalis digitalinum digitoxinum gratiola leptandra linaria plantago veronica',
  Scrophulariaceae: 'betonica scrophularia scroph verbascum',
  Oleaceae: 'chionanthus fraxinus jasminum nyctanthes olea',
  Verbenaceae: 'lantana lippia priva verbena',
  Bignoniaceae: 'catalpa jacaranda markhamia',
  Acanthaceae: 'andrographis brillantaisia hygrophilia hypoestes justicia thomandersia',
  Orobanchaceae: 'epiphegus euphrasia orobanche pedicularis',
  Pedaliaceae: 'ceratotheca harpagophytum',
  Phrymaceae: 'mimulus',
  Aquifoliaceae: 'ilex mate prinos',
  Asteraceae: 'abrotanum absinthium achillea ageratum ambrosia anthemis arnica artemisia aster bellis bidens blumea brachyglottis calendula callilepis carduus carlina centaurea chamomilla chrysanthellum chrysanthemum cichorium cina cineraria cnicus conyza cynara echinacea erechthites erigeron erlangea espeletia eupatorium galinsoga gnaphalium grindelia guizotia gynura helianthus hieracium inula lactuca lappa lapsana liatris microglossa mikania millefolium nabalus onopordon osteospermum othonna parthenium polymnia pyrethrum santoninum senecio siegesbeckia silphium solidago tanacetum taraxacum tussilago ursinia vernonia wedelia wyethia xanthium',
  Campanulaceae: 'campanula lobelia lobelinum',
  Menyanthaceae: 'menyanthes',
  Adoxaceae: 'adoxa sambucus viburnum',
  Caprifoliaceae: 'lonicera symphoricarpus triosteum valeriana',
  Apiaceae: 'aegopodium aethusa ammi ammoniacum angelica angelicae apiolum apium asa athamanta brancaursina carum cicuta conium coniinum coriandrum eryngium ferula foeniculum heracleum hydrocotyle imperatoria levisticum lichtensteinia oenanthe pastinaca petroselinum phellandrium pimpinella silphion sium sumbulus thapsia zizia',
  Araliaceae: 'aralia ginseng hedera',
}

// ─────────────────────────────── fungi & lichens ───────────────────────────────

const FUNGUS_GROUPS = [
  ['basidio', 'Mushrooms & bracket fungi (Basidiomycota)', 'agaricus agaricinum muscarine boletus bovista polyporus russula phallus psilocybe pycnoporus'],
  ['smuts', 'Smut fungi (Ustilaginomycetes)', 'ustilago'],
  ['asco', 'Sac fungi & ergot (Ascomycota)', 'secale ergotinum cordyceps aspergillus nectrianinum dematium'],
  ['yeasts', 'Yeasts (Saccharomycetes)', 'candida monilia torula cryptococcinum'],
  ['moulds', 'Pin moulds (Mucoromycota)', 'mucor'],
  ['lichens', 'Lichens', 'cetraria cladonia sticta usnea'],
]

// ─────────────────────────────── animals ───────────────────────────────

/** [id, name, parent id | null, first words]. Parents are listed before children. */
const ANIMAL_GROUPS = [
  ['mammals', 'Mammals', null, ''],
  ['milks', 'Milks (Lac)', 'mammals', 'lac colostrum lactis'],
  ['mammals-other', 'Mammal substances', 'mammals', 'ambra castoreum castor cervus delphinus mephitis moschus phascolarctos spiggurus adeps'],
  ['birds', 'Birds', null, 'accipiter ara bubo buteo columba corvus cygnus falco falcon haliaeetus pullus threskiornis vultur nidus ova ovi guano'],
  ['reptiles', 'Reptiles', null, ''],
  ['snakes', 'Snakes', 'reptiles', ''],
  ['viperidae', 'Vipers & pit vipers (Viperidae)', 'snakes', 'ancistrodon bitis bothrops cenchris crotalus lachesis toxicophis trimeresurus vipera'],
  ['elapidae', 'Cobras, kraits & sea snakes (Elapidae)', 'snakes', 'bungarus dendroaspis elaps hydrophis naja oxyuranus'],
  ['lizards', 'Lizards & worm lizards', 'reptiles', 'amphisbaena heloderma lacerta'],
  ['dinosaurs', 'Dinosaurs (fossil)', 'reptiles', 'maiasaura'],
  ['amphibians', 'Amphibians', null, 'bufo salamandra'],
  ['fish', 'Fish', null, 'barbae erythrinus gadus galeocerdo hippocampus oncorynchus pyrarara trachinus urolophus'],
  ['arthropods', 'Arthropods', null, ''],
  ['insects', 'Insects', 'arthropods', ''],
  ['hymenoptera', 'Bees, wasps & ants (Hymenoptera)', 'insects', 'apis apisinum formica mel propolis vespa vespula'],
  ['coleoptera', 'Beetles (Coleoptera)', 'insects', 'cantharis cantharidinum cetonia coccinella doryphora'],
  ['lepidoptera', 'Butterflies & moths (Lepidoptera)', 'insects', 'agamemnon apeira bombyx inachis limenitis pieris'],
  ['hemiptera', 'True bugs (Hemiptera)', 'insects', 'aphis cimex coccus triatoma'],
  ['diptera', 'Flies & mosquitoes (Diptera)', 'insects', 'culex musca oestrus simulium'],
  ['insects-other', 'Other insects', 'insects', 'blatta calopteryx pediculus pulex'],
  ['arachnids', 'Arachnids', 'arthropods', ''],
  ['spiders', 'Spiders', 'arachnids', 'aranea aranearum atrax avicularia latrodectus latrodectuskatipo loxosceles mygale tarentula theridion'],
  ['scorpions', 'Scorpions', 'arachnids', 'androctonus buthus scorpio'],
  ['mites', 'Mites & ticks', 'arachnids', 'ixodes trombidium'],
  ['horseshoe', 'Horseshoe crabs', 'arthropods', 'limulus'],
  ['myriapods', 'Centipedes', 'arthropods', 'scolopendra'],
  ['crustaceans', 'Crustaceans', 'arthropods', 'cancer homarus oniscus'],
  ['molluscs', 'Molluscs', null, 'conchiolinum cypraea helix limex murex pecten pernus sepia venus'],
  ['cnidarians', 'Jellyfish & corals (Cnidaria)', null, 'chironex corallium medusa physalia'],
  ['echinoderms', 'Starfish (Echinodermata)', null, 'asterias'],
  ['sponges', 'Sponges (Porifera)', null, 'badiaga spongia'],
  ['worms', 'Worms (annelids & nematodes)', null, 'ascaris enterobius helodrilus sanguisuga'],
]

// ─────────────────────────────── nosodes ───────────────────────────────

const NOSODE_GROUPS = [
  ['major', 'Miasmatic nosodes', 'psorinum medorrhinum syphilinum'],
  ['tuberculinic', 'Tuberculinic nosodes', 'tuberculinum tuberculin bacillinum'],
  ['cancer', 'Cancer nosodes', 'carcinosinum scirrhinum epihysterinum'],
  ['bowel', 'Bowel nosodes (Bach–Paterson)', 'bacillus'],
  ['bacterial', 'Bacterial disease nosodes', 'anthracinum botulinum colibacillinum coqueluchinum diphtherinum diphterotoxinum eberthinum enterococcinum framboesinum gonorrhin hippozaeninum leprominium listeriosis malandrinum meningococcinum mucococcinum mucotoxinum paratyphoidinum pestinum pneumococcinum puromococcin scarlatininum septicaeminum staphylococcinum staphylotoxinum streptococcin tetanotoxinum chlamydinum'],
  ['viral', 'Viral nosodes', 'aids calici coxsackie hydrophobinum influenzinum morbillinum ourlianum parotidinum polio rubella vaccininum variolinum verrucinum'],
  ['vaccines', 'Vaccines & sera', 'diphthero distemperinum egg haffkine pertussis pollantin vaccin vaccinum'],
  ['parasitic', 'Fungal & parasitic nosodes', 'malaria malariatoxinum cysticin'],
  ['pathological', 'Pathological products', 'appendictitis asthma calculus mastoiditis melitagrinum multiple osteo osteomyelitis osteomyelosclerosis otitis periproctitic pyrogenium sinusitisinum uratic oscillococcinum'],
]

// ─────────────────────────────── sarcodes ───────────────────────────────

const SARCODE_GROUPS = [
  ['hormones', 'Hormones', 'adrenalinum androsteron corticotropinum cortisonum folliculinum glucagon hydrocortisone insulinum luteinum metacortin secretinum stilboestrolum testosterone thyreoidinum thyreotropinum thyro'],
  ['glands', 'Glands & organs', 'cartilago chorda cutis embryo glandula hypothalamus kidneys medulla oophorinum orchitinum ovaries pancreas parathyreoidinum pituitaria placenta prostate pulmo suis testicles thalamus thymi thymulininum mucosa amnii'],
  ['secretions', 'Enzymes & secretions', 'fel ingluvin pancreatinum pepsinum urinum'],
  ['messengers', 'Neurotransmitters & mediators', 'acetylcholine acetylcholinum histaminum serotoninum heparinum interferon'],
]

// ─────────────────────────────── imponderables ───────────────────────────────

const IMPONDERABLE_GROUPS = [
  ['energy', 'Electricity, magnetism & radiation', 'electricitas galvanismus magnetis positronum spectrum'],
  ['cosmic', 'Sun, moon & eclipse', 'luna sol solar'],
  ['weather', 'Weather & elements', 'tempestas ignis pluvia'],
  ['mind', 'Other imponderables', 'dreaming'],
]

// ─────────────────────────────── bacteria & protozoa ───────────────────────────────

const BACTERIA_GROUPS = [
  ['cultures', 'Bacterial species', 'brucella chlamydia helicobacter leptospira'],
]

// ─────────────────────────────── other (chemicals, drugs, foods) ───────────────────────────────

const OTHER_GROUPS = [
  ['drugs', 'Pharmaceutical drugs', 'acetanilidum acetylsalicylicum aminocaproicum amphetaminum amylocainum antipyrinum aristol atoxyl barbital chloralum chloramphenicolum chlorpromazinum cisplatina clomipramine cyclophosphamide cyclosporinum diazepam durbital haloperidolum iodoformium levomepromazinum lsd lysidinum methysergidum naloxon orexine oxytetracycline penicillinum perhexilinum phenacetinum phenobarbitalum piperazinum propranololum protargol salol streptomycinum sulfaguanidinum sulfanilamidum sulfonalum sulfonamidum tetracyclinum thioproperazinum thiosinaminum trional urotropinum'],
  ['anaesthetics', 'Solvents, alcohols & anaesthetics', 'acetonum aethylium alcoholus aldehyde amylenum amylium chloroformum ether ethyl methanol methyl methylenum spiritus nitri glonoinum formalinum metaldehydum'],
  ['aromatics', 'Synthetic organic chemicals & dyes', 'alpha anilinum analinum anthraquinone benzinum benzolum benzoquinonum carbolicum collodion congo dioxinum eosinum fluoroformium fuchsin fuschina hydroquinone indolum kresolum methylene naphthalinum naphthoquinone nitrobenzolum parabenzoquinonum paraphenylendiaminum polystyrenum quinhydrone resorcinum scatolum toluidinum trimethylaminum trinitroto amylamine cumarinum guajacolum'],
  ['organic-acids', 'Organic acids', 'aceticum benzoicum butyricum chrysophanicum citricum formicicum fumaricum gallicum hippuricum ketoglutaricum lacticum malicum oroticum oxalicum picricum salicylicum tannicum tartaricum uricum'],
  ['biochemicals', 'Biochemicals & vitamins', 'adenosinum alloxanum cholesterinum cholinum coenzyme creatinum desoxyribonucleicum gamma gelatin glycerinum glycocollum lecithinum lysinum nicotinamide nicotinamidum pantothenicum pyridoxinum retinoicum riboflavinum ribonucleicum thiaminum thiocticum tocopherolum urea vitamin vit'],
  ['foods', 'Foods, drinks & preparations', 'cerevisia chocolate fructi rescue vinum lignum vibhuti'],
  ['protozoa', 'Protozoa', 'toxoplasma trichomonas'],
]

// ─────────────────────────────── minerals ───────────────────────────────

/** [symbol, Z, name, period, group (1–18, 'La', 'Ac')]. */
const ELEMENTS = [
  ['H', 1, 'Hydrogenium', 1, 1], ['He', 2, 'Helium', 1, 18],
  ['Li', 3, 'Lithium', 2, 1], ['Be', 4, 'Beryllium', 2, 2], ['B', 5, 'Borium', 2, 13], ['C', 6, 'Carboneum', 2, 14], ['N', 7, 'Nitrogenium', 2, 15], ['O', 8, 'Oxygenium', 2, 16], ['F', 9, 'Fluorum', 2, 17], ['Ne', 10, 'Neon', 2, 18],
  ['Na', 11, 'Natrium', 3, 1], ['Mg', 12, 'Magnesium', 3, 2], ['Al', 13, 'Aluminium', 3, 13], ['Si', 14, 'Silicium', 3, 14], ['P', 15, 'Phosphorus', 3, 15], ['S', 16, 'Sulphur', 3, 16], ['Cl', 17, 'Chlorum', 3, 17], ['Ar', 18, 'Argon', 3, 18],
  ['K', 19, 'Kalium', 4, 1], ['Ca', 20, 'Calcium', 4, 2], ['Sc', 21, 'Scandium', 4, 3], ['Ti', 22, 'Titanium', 4, 4], ['V', 23, 'Vanadium', 4, 5], ['Cr', 24, 'Chromium', 4, 6], ['Mn', 25, 'Manganum', 4, 7], ['Fe', 26, 'Ferrum', 4, 8], ['Co', 27, 'Cobaltum', 4, 9], ['Ni', 28, 'Niccolum', 4, 10], ['Cu', 29, 'Cuprum', 4, 11], ['Zn', 30, 'Zincum', 4, 12], ['Ga', 31, 'Gallium', 4, 13], ['Ge', 32, 'Germanium', 4, 14], ['As', 33, 'Arsenicum', 4, 15], ['Se', 34, 'Selenium', 4, 16], ['Br', 35, 'Bromium', 4, 17], ['Kr', 36, 'Krypton', 4, 18],
  ['Rb', 37, 'Rubidium', 5, 1], ['Sr', 38, 'Strontium', 5, 2], ['Y', 39, 'Yttrium', 5, 3], ['Zr', 40, 'Zirconium', 5, 4], ['Nb', 41, 'Niobium', 5, 5], ['Mo', 42, 'Molybdenum', 5, 6], ['Tc', 43, 'Technetium', 5, 7], ['Ru', 44, 'Ruthenium', 5, 8], ['Rh', 45, 'Rhodium', 5, 9], ['Pd', 46, 'Palladium', 5, 10], ['Ag', 47, 'Argentum', 5, 11], ['Cd', 48, 'Cadmium', 5, 12], ['In', 49, 'Indium', 5, 13], ['Sn', 50, 'Stannum', 5, 14], ['Sb', 51, 'Antimonium', 5, 15], ['Te', 52, 'Tellurium', 5, 16], ['I', 53, 'Iodium', 5, 17], ['Xe', 54, 'Xenon', 5, 18],
  ['Cs', 55, 'Caesium', 6, 1], ['Ba', 56, 'Baryta', 6, 2], ['La', 57, 'Lanthanum', 6, 'La'], ['Ce', 58, 'Cerium', 6, 'La'], ['Sm', 62, 'Samarium', 6, 'La'], ['Hf', 72, 'Hafnium', 6, 4], ['Ta', 73, 'Tantalum', 6, 5], ['W', 74, 'Tungstenium', 6, 6], ['Re', 75, 'Rhenium', 6, 7], ['Os', 76, 'Osmium', 6, 8], ['Ir', 77, 'Iridium', 6, 9], ['Pt', 78, 'Platinum', 6, 10], ['Au', 79, 'Aurum', 6, 11], ['Hg', 80, 'Mercurius', 6, 12], ['Tl', 81, 'Thallium', 6, 13], ['Pb', 82, 'Plumbum', 6, 14], ['Bi', 83, 'Bismuthum', 6, 15], ['Po', 84, 'Polonium', 6, 16], ['At', 85, 'Astatinum', 6, 17], ['Rn', 86, 'Radon', 6, 18],
  ['Ra', 88, 'Radium', 7, 2], ['U', 92, 'Uranium', 7, 'Ac'], ['Np', 93, 'Neptunium', 7, 'Ac'], ['Pu', 94, 'Plutonium', 7, 'Ac'],
]
const PERIODIC_GROUP_NAMES = {
  1: 'Hydrogen & alkali metals', 2: 'Alkaline earth metals', 3: 'Scandium group', 4: 'Titanium group', 5: 'Vanadium group',
  6: 'Chromium group', 7: 'Manganese group', 8: 'Iron group', 9: 'Cobalt group', 10: 'Nickel group', 11: 'Copper group (coinage metals)',
  12: 'Zinc group', 13: 'Boron group', 14: 'Carbon group', 15: 'Nitrogen group (pnictogens)', 16: 'Oxygen group (chalcogens)',
  17: 'Halogens', 18: 'Noble gases', La: 'Lanthanides (rare earths)', Ac: 'Actinides',
}

/** Words that name an element as the cation / main element of a mineral remedy. */
const ELEMENT_WORDS = {
  H: 'hydrogenium', He: 'helium', Li: 'lithium', Be: 'beryllium', B: 'borium boricum borax', C: 'carbo carboneum graphites adamas anthrakokali', N: 'nitrogenium',
  O: 'oxygenium ozonum', F: 'fluor fluoricum', Ne: 'neon', Na: 'natrium natrum', Mg: 'magnesium magnesia', Al: 'alumina aluminium alumen',
  Si: 'silicea silica silicium', P: 'phosphorus', S: 'sulphur sulfur', Cl: 'chlorum', Ar: 'argon', K: 'kalium kali', Ca: 'calcarea',
  Sc: 'scandium', Ti: 'titanium titan', V: 'vanadium', Cr: 'chromium chromicum', Mn: 'manganum', Fe: 'ferrum', Co: 'cobaltum', Ni: 'niccolum',
  Cu: 'cuprum', Zn: 'zincum', Ga: 'gallium', Ge: 'germanium', As: 'arsenicum', Se: 'selenium', Br: 'bromum bromium', Kr: 'krypton', Rb: 'rubidium',
  Sr: 'strontium', Y: 'yttrium', Zr: 'zirconium', Nb: 'niobium', Mo: 'molybdenium', Tc: 'technetium', Ru: 'ruthenium', Rh: 'rhodium rodium',
  Pd: 'palladium', Ag: 'argentum', Cd: 'cadmium', In: 'indium', Sn: 'stannum', Sb: 'antimonium stibium', Te: 'tellurium', I: 'iodium',
  Xe: 'xenon', Cs: 'caesium', Ba: 'baryta', La: 'lanthanum', Ce: 'cerium', Sm: 'samarium', Hf: 'hafnium', Ta: 'tantalum', W: 'tungstenium',
  Re: 'rhenium', Os: 'osmium', Ir: 'iridium', Pt: 'platinum', Au: 'aurum', Hg: 'mercurius cinnabaris', Tl: 'thallium', Pb: 'plumbum',
  Bi: 'bismutum bismuthum', Po: 'polonium', At: 'astatinum', Rn: 'radon', Ra: 'radium', U: 'uranium', Np: 'neptunium', Pu: 'plutonium',
}
/** Second-position element words (double salts, "…natronatum", "…kalinatum"). */
const ELEMENT_ADJ = {
  natronatum: 'Na', natronata: 'Na', natricum: 'Na', kalinatum: 'K', stibiatum: 'Sb', stibiato: 'Sb', auratus: 'Au',
  ferricitricum: 'Fe', antimonialis: 'Sb', mineralis: 'Hg', antimonii: 'Sb',
}

/** Anion / salt words → [salt group id, element symbols carried by the anion]. */
const ANIONS = {
  carbonicum: ['carbonates', 'C O'], carbonica: ['carbonates', 'C O'], bicarbonicum: ['carbonates', 'C O'],
  muriaticum: ['chlorides', 'Cl'], muriatica: ['chlorides', 'Cl'], muriaticus: ['chlorides', 'Cl'], chloratum: ['chlorides', 'Cl'], chloridum: ['chlorides', 'Cl'], chloricum: ['chlorides', 'Cl'], chlorinata: ['chlorides', 'Cl'], perchloratum: ['chlorides', 'Cl'], bichloratum: ['chlorides', 'Cl'], tetrachloratum: ['chlorides', 'Cl'], hypochlorosum: ['chlorides', 'Cl'], chlorosum: ['chlorides', 'Cl'], corrosivus: ['chlorides', 'Cl'], dulcis: ['chlorides', 'Cl'],
  sulphuricum: ['sulphates', 'S O'], sulfuricum: ['sulphates', 'S O'], sulphurica: ['sulphates', 'S O'], sulphuricus: ['sulphates', 'S O'], sulphatum: ['sulphates', 'S O'],
  sulphuratum: ['sulphides', 'S'], sulfuratum: ['sulphides', 'S'], sulphurosum: ['sulphites', 'S O'], sulfurosum: ['sulphites', 'S O'], thiosulfuricum: ['sulphites', 'S O'], thiosulphuricum: ['sulphites', 'S O'], hyposulfurosa: ['sulphites', 'S O'], sulpho: ['sulphides', 'S'],
  phosphoricum: ['phosphates', 'P O'], phosphorica: ['phosphates', 'P O'], phosphoricus: ['phosphates', 'P O'], pyrophosphoricum: ['phosphates', 'P O'], hypophosphorosum: ['phosphates', 'P O'], hypophosphorosa: ['phosphates', 'P O'], hypophosphorum: ['phosphates', 'P O'], lactophosphorica: ['phosphates', 'P O'],
  iodatum: ['iodides', 'I'], iodata: ['iodides', 'I'], iodatus: ['iodides', 'I'], hydriodica: ['iodides', 'I'], biniodatus: ['iodides', 'I'],
  bromatum: ['bromides', 'Br'], bromata: ['bromides', 'Br'], bromatus: ['bromides', 'Br'], bromicum: ['bromides', 'Br'], bromidum: ['bromides', 'Br'],
  fluoratum: ['fluorides', 'F'], fluorica: ['fluorides', 'F'], fluoricum: ['fluorides', 'F'], silicofluoricum: ['fluorides', 'F Si'],
  nitricum: ['nitrates', 'N O'], nitrica: ['nitrates', 'N O'], nitricus: ['nitrates', 'N O'], nitrosum: ['nitrates', 'N O'], nitrosus: ['nitrates', 'N O'], pernitricum: ['nitrates', 'N O'],
  aceticum: ['acetates', ''], acetica: ['acetates', ''], aceticus: ['acetates', ''],
  arsenicosum: ['arsenites', 'As'], arsenicosa: ['arsenites', 'As'], arsenicicum: ['arsenites', 'As'], arsenicum: ['arsenites', 'As'],
  oxydatum: ['oxides', 'O'], oxydata: ['oxides', 'O'], oyxdata: ['oxides', 'O'], causticum: ['oxides', 'O H'], caustica: ['oxides', 'O H'], hydroxydum: ['oxides', 'O H'], usta: ['oxides', 'O'], praecipitatus: ['oxides', 'O'], precipitatus: ['oxides', 'O'], calcinata: ['oxides', 'O'],
  cyanatum: ['cyanides', 'C N'], cyanatus: ['cyanides', 'C N'], ferrocyanatum: ['cyanides', 'C N Fe'], hydrocyanicum: ['cyanides', 'C N'], thiocyanatum: ['cyanides', 'C N S'],
  silicatum: ['silicates', 'Si O'], silicicum: ['silicates', 'Si O'], silicata: ['silicates', 'Si O'], silicum: ['silicates', 'Si O'],
  metallicum: ['metals', ''], metallica: ['metals', ''], purum: ['metals', ''], reductum: ['metals', ''], vivus: ['metals', ''], met: ['metals', ''], colloidale: ['metals', ''], solubilis: ['metals', ''],
  chromicum: ['chromates', 'Cr O'], chromatum: ['chromates', 'Cr O'], bichromicum: ['chromates', 'Cr O'], bichromatum: ['chromates', 'Cr O'],
  oxalicum: ['organic-salts', ''], lacticum: ['organic-salts', ''], lactica: ['organic-salts', ''], citricum: ['organic-salts', ''], tartaricum: ['organic-salts', ''], bitartaricum: ['organic-salts', ''], bioxalicum: ['organic-salts', ''],
  picricum: ['organic-salts', ''], picrica: ['organic-salts', ''], salicylicum: ['organic-salts', ''], valerianicum: ['organic-salts', ''], benzoicum: ['organic-salts', ''], gluconicum: ['organic-salts', ''], succinicum: ['organic-salts', ''], pyruvicum: ['organic-salts', ''], oxalaceticum: ['organic-salts', ''], uricum: ['organic-salts', ''], taurocholicum: ['organic-salts', ''], choleinicum: ['organic-salts', ''], cacodylicum: ['organic-salts', 'As'], sulphocarbolicum: ['organic-salts', 'S'], sulfovinicum: ['organic-salts', 'S'], xanthogenicum: ['organic-salts', 'S'], formaldehydum: ['organic-salts', ''], methylenus: ['organic-salts', ''], tannicus: ['organic-salts', ''], oxalsuccinata: ['organic-salts', ''], borocitricum: ['organic-salts', 'B'], ovi: ['carbonates', 'C O'],
  permanganatum: ['permanganates', 'Mn O'], selenicum: ['selenium-tellurium-salts', 'Se'], selenicosum: ['selenium-tellurium-salts', 'Se'], telluricum: ['selenium-tellurium-salts', 'Te'], vanadinicum: ['vanadates', 'V'],
  tetra: ['organic-salts', ''], oxygenatum: ['oxides', 'O'], subnitricum: ['nitrates', 'N'], sulphurata: ['sulphides', 'S'], protoxalatum: ['organic-salts', ''],
}
const SALT_NAMES = {
  carbonates: 'Carbonates', chlorides: 'Chlorides (muriaticum)', sulphates: 'Sulphates', sulphides: 'Sulphides (sulphuratum)',
  sulphites: 'Sulphites & thiosulphates', phosphates: 'Phosphates', iodides: 'Iodides', bromides: 'Bromides', fluorides: 'Fluorides',
  nitrates: 'Nitrates & nitrites', acetates: 'Acetates', arsenites: 'Arsenites & arsenates', oxides: 'Oxides & hydroxides', cyanides: 'Cyanides',
  silicates: 'Silicates', chromates: 'Chromates', permanganates: 'Permanganates', 'selenium-tellurium-salts': 'Selenites & tellurites', vanadates: 'Vanadates',
  'organic-salts': 'Salts of organic acids',
}

/** Acid adjectives. Inorganic ones are mineral acids with their elements; the rest go to Other → Organic acids. */
const INORGANIC_ACIDS = {
  muriaticum: 'H Cl', hydrochloridum: 'H Cl', nitricum: 'H N O', nitromuriaticum: 'H N O Cl', sulphuricum: 'H S O', sulphurosum: 'H S O',
  phosphoricum: 'H P O', fluoricum: 'H F', hydrocyanicum: 'H C N', hydrobromicum: 'H Br', boricum: 'H B O', chromicum: 'H Cr O',
  osmicum: 'Os O', telluricum: 'H Te O', arsenicum: 'H As O', antimonium: 'H Sb O',
}

/** Other mineral categories keyed by first word; elements for the periodic tree in brackets. */
const MINERAL_CATEGORIES = [
  ['rocks', 'Rocks, minerals & earths', {
    lapis: '', lava: 'Si', granitum: 'Si', limestone: 'Ca C', white: 'Ca C', mica: 'Si Al K', kaolinum: 'Al Si', slag: 'Si Ca',
    cement: 'Ca Si', chrysolite: 'Mg Fe Si', apatit: 'Ca P F', saxonitum: '', samarsite: '', vermiculite: 'Mg Si', tetradymitum: 'Bi Te S',
    aethiops: 'Hg S', succ: '', gunpowder: 'K N S C',
  }],
  ['waters', 'Mineral waters & springs', { aqua: '', sal: 'Na Cl', saline: 'Na Cl', eaux: '', levico: 'Fe As', lippspringe: '', reinerz: '', voeslau: '' }],
  ['hydrocarbons', 'Hydrocarbons, tars & fossil oils', { petroleum: 'C', naphtha: 'C', kerosenum: 'C', kerosolenum: 'C', paraffinum: 'C', eupionum: 'C', ichthyolum: 'C S', fuligo: 'C', kreosotum: 'C' }],
]

// ─────────────────────────────── full-name overrides ───────────────────────────────

/** Exact lower-case names → 'kind:target'. kind: plant (family), animal, fungus, nosode, sarcode, impon, bacteria, other, mineral (category or 'el:<sym> …'). */
const FULL = {
  'oleum animale aethereum': 'animal:mammals-other',
  'oleum jecoris aselli': 'animal:fish',
  'oleum myristicae': 'plant:Myristicaceae',
  'oleum santali': 'plant:Santalaceae',
  'oleum succinum': 'mineral:rocks',
  'oleum caryophyllatum': 'plant:Myrtaceae',
  'oleum eucalyptus': 'plant:Myrtaceae',
  'oleum lavandulae': 'plant:Lamiaceae',
  'serum anguillae': 'animal:fish',
  'serum anti colibacillum': 'nosode:vaccines',
  'serum febris suis': 'nosode:vaccines',
  'serum yersiniae': 'nosode:vaccines',
  'hepar sulphur': 'mineral:el:Ca S|sulphides', // calcium sulphide (impure), Hahnemann's calcarea sulphurata
  'hepar suis': 'sarcode:glands',
  'pulmo vulpis': 'sarcode:glands',
  'pulmo anaphylacticus': 'sarcode:glands',
  'nasturtium aqua': 'plant:Brassicaceae',
  'sanicula aqua': 'mineral:waters',
  'aqua marina': 'mineral:waters',
  'aqua calcarea': 'mineral:waters',
  'aqua silicata': 'mineral:waters',
  'lapis albus': 'mineral:rocks',
  'lapis lazuli': 'mineral:rocks',
  'x-ray': 'impon:energy',
  'mel cum sale': 'animal:hymenoptera',
  'saccharum lactis': 'animal:milks',
  'calcarea ovi testae': 'mineral:el:Ca C|carbonates',
  'alumina': 'mineral:el:Al O|oxides',
  'silicea terra': 'mineral:el:Si O|oxides',
  'silica marina': 'mineral:el:Si O|oxides',
  'arsenicum album': 'mineral:el:As O|oxides',
  'antimonium crudum': 'mineral:el:Sb S|sulphides',
  'antimonium tartaricum': 'mineral:el:Sb K|organic-salts',
  'mercurius praecipitatus albus': 'mineral:el:Hg N Cl|chlorides',
  'natrium muriaticum': 'mineral:el:Na Cl|chlorides',
  'carbo animalis': 'mineral:el:C|metals',
  'carbo vegetabilis': 'mineral:el:C|metals',
  'coca cola': 'other:foods',
  'solanum tuberosum aegrotans': 'plant:Solanaceae',
  'semen tiglii': 'plant:Euphorbiaceae',
  'acidum sarcolacticum': 'other:organic-acids',
  'causticum': 'mineral:el:K Ca',
  'nitri spiritus dulcis': 'other:anaesthetics',
  'spiritus aetheris compositus': 'other:anaesthetics',
  'terebinthina chios': 'plant:Anacardiaceae',
  'terebinthina laricina': 'plant:Pinaceae',
  'sulphur terebinthinatum': 'mineral:el:S',
  'magnesium artificialis': 'mineral:el:Mg',
  'hippomanes': 'animal:mammals-other',
  'glandula pinealis': 'sarcode:glands',
  'glandula mammalis': 'sarcode:glands',
  'supra-renal extract': 'sarcode:hormones',
  'rescue (bachblüten)': 'other:foods',
  'various iodites': 'mineral:el:I',
  'fluor purum': 'mineral:el:F',
  'bellis perennis spagyricus': 'plant:Asteraceae',
  'kidneys': 'sarcode:glands',
  'cancer fluviatilis': 'animal:crustaceans',
  'vipera lachesis fel': 'animal:viperidae',
  'lac vaccinum': 'animal:milks',
  'egg vaccine': 'nosode:vaccines',
  'suis (chorda umbilicalis)': 'sarcode:glands',
  'gelatin': 'other:biochemicals',
  'nux moschata': 'plant:Myristicaceae',
  'nux vomica': 'plant:Loganiaceae',
  'eupatorium aromaticum': 'plant:Asteraceae',
  'furfur iritici': 'plant:Poaceae',
  'balsamum peruvianum': 'plant:Fabaceae',
  'balsamum tolutanum': 'plant:Fabaceae',
  'resina itu': null, // unidentified resin
  'upas antiaris': 'plant:Moraceae',
  'uva ursi': 'plant:Ericaceae',
  'triticum repens': 'plant:Poaceae',
  'triticum vulgare': 'plant:Poaceae',
  'chaulmo ogra': 'plant:Achariaceae',
  'guano australis': 'animal:birds',
  'cinnabaris': 'mineral:el:Hg S',
  'aethiops mineralis': 'mineral:el:Hg S',
  'aethiops antimonialis': 'mineral:el:Hg Sb S',
  'vitrum antimonii': 'mineral:el:Sb O S',
  'vitrum coroni': 'mineral:el:Si Na Ca|silicates',
  'adamas': 'mineral:el:C',
  'graphites': 'mineral:el:C',
  'anthrakokali': 'mineral:el:C K',
  'alumen': 'mineral:el:Al K S|sulphates',
  'borax veneta': 'mineral:el:Na B',
  // Hahnemann's soluble mercury (mercurous amido-nitrate with metallic Hg) is used and read as the metal
  'mercurius solubilis': 'mineral:el:Hg|metals',
  'ignis alcoholis': 'impon:weather',
  'dreaming potency': 'impon:mind',
  'sol britannicus': 'impon:cosmic',
  'solar eclips': 'impon:cosmic',
  'lignum naufragium helvetiae': 'other:foods',
  'plumbum tetra-aethylicum': 'mineral:el:Pb C',
  'chininum ferricitricum': 'plant:Rubiaceae',
  'strychninum and ferr-cit.': 'plant:Loganiaceae',
  'cadmium calcarea fluoricum': 'mineral:el:Cd Ca F',
  'aurum natrum fluoricum': 'mineral:el:Au Na F',
  'magnesium borocitricum': 'mineral:el:Mg B',
  'cuprum ammonio-sulphuricum': 'mineral:el:Cu N S|sulphates',
  'zincum ferrocyanatum': 'mineral:el:Zn Fe C N',
  'kalium ferrocyanatum': 'mineral:el:K Fe C N',
  'mercurius biniodatus cum kali iodatum': 'mineral:el:Hg I K',
  'mercurius tannicus oxydilatum': 'mineral:el:Hg O',
  'mercurius methylenus': 'mineral:el:Hg C',
  'mercuresceinum natricum': 'other:aromatics',
  'phosphorus hydrogenatus': 'mineral:el:P H',
  'phosphorus muriaticus': 'mineral:el:P Cl',
  'arsenicum hydrogenisatum': 'mineral:el:As H',
  'sulphur hydrogenisatum': 'mineral:el:S H',
  'carboneum hydrogenisatum': 'mineral:el:C H',
  'carboneum oxygenisatum': 'mineral:el:C O',
  'carboneum dioxydum': 'mineral:el:C O',
  'iodium hydrogenisatum': 'mineral:el:I H',
  'bromium iodatum': 'mineral:el:Br I',
  'sulphur iodatum': 'mineral:el:S I',
  'various aurums': 'mineral:el:Au',
  'various barytas': 'mineral:el:Ba',
  'various calcareas': 'mineral:el:Ca',
  'various ferrums': 'mineral:el:Fe',
  'various mercuries': 'mineral:el:Hg',
  'croton chloral': 'other:anaesthetics',
  'methyl salicylate': 'other:anaesthetics',
  'methylene blue': 'other:aromatics',
  'benzinum dinitricum': 'other:aromatics',
  'benzinum nitricum': 'other:aromatics',
  'titan-g. + titan-n.': 'mineral:el:Ti',
  'succ. + succ-ac. + ol-suc.': 'mineral:rocks',
  'amygdalus persica': 'plant:Rosaceae',
  'carcinosinum colon adeno': 'nosode:cancer',
  'medulla ossis suis': 'sarcode:glands',
  'pituitaria posterior (alte abk.)': 'sarcode:glands',
  'natrum sulfovinicum': 'mineral:el:Na S',
  'chlamydia trachomatis': 'bacteria:cultures',
  'vaccinum rabiei ex cellulis': 'nosode:vaccines',
  'vaccin atténué bilié': 'nosode:vaccines',
}

// ─────────────────────────────── themes ───────────────────────────────

const SEA = 'aqua marina|sal marinum|natrium muriaticum|silica marina|fucus vesiculosus|fucus crispus|gelatina helmintochorti|ambra grisea|asterias rubens|medusa|physalia pelagica|chironex fleckeri|corallium rubrum|murex purpurea|sepia officinalis|pecten|venus mercenaria|cypraea eglantina|pernus canaliculus|conchiolinum|homarus gammarus|homarus (uknown type)|limulus cyclops|spongia tosta|urolophus halleri|galeocerdo cuvier hepar|hippocampus kuda|trachinus|hydrophis cyanocinctus|delphinus|lac delphinum|gadus morrhua|oleum jecoris aselli|oncorynchus tsawytscha|calcarea carbonica'

// ═════════════════════════════ build ═════════════════════════════

const remedies = JSON.parse(readFileSync(resolve(root, 'public/data/remedies.json'), 'utf8'))

/** @type {Map<string, {id:string,name:string,kind:string,parent:string|null,note?:string,remedies:Set<number>}>} */
const groups = new Map()
function group(id, name, kind, parent, note) {
  let g = groups.get(id)
  if (!g) {
    g = { id, name, kind, parent: parent ?? null, remedies: new Set() }
    if (note) g.note = note
    groups.set(id, g)
  }
  return g
}
/** remedy id → its primary group: the first group a remedy is filed under (botanical family, cation element, animal group …). */
const primary = new Map()
function add(id, rid) {
  const g = groups.get(id)
  if (!g) throw new Error(`Unknown group ${id}`)
  g.remedies.add(rid)
  if (!primary.has(rid) && !id.startsWith('theme')) primary.set(rid, id)
}

// kingdoms (fixed order)
const KINGDOMS = [
  ['plant', 'Plants'], ['mineral', 'Minerals'], ['animal', 'Animals'], ['fungus', 'Fungi & lichens'], ['nosode', 'Nosodes'],
  ['sarcode', 'Sarcodes'], ['bacteria', 'Bacteria'], ['impon', 'Imponderabilia'], ['other', 'Chemicals, drugs & other'],
]
for (const [k, n] of KINGDOMS) group(`k:${k}`, n, 'kingdom', null)

// plant tree
const plantWord = new Map()
for (const c of CLADE_ORDER) group(`plant:clade:${c}`, CLADE_NAMES[c], 'clade', 'k:plant')
for (const [fam, list] of Object.entries(PLANT_FAMILY_WORDS)) {
  const order = FAMILY_ORDER[fam]
  if (!order) throw new Error(`No order for ${fam}`)
  const clade = ORDER_CLADE[order]
  if (!clade) throw new Error(`No clade for ${order}`)
  group(`plant:order:${order}`, order, 'order', `plant:clade:${clade}`)
  group(`plant:family:${fam}`, fam, 'family', `plant:order:${order}`)
  for (const w of words(list)) {
    const key = w.replace(/\?$/, '')
    if (plantWord.has(key)) throw new Error(`Plant word ${key} in ${fam} and ${plantWord.get(key)}`)
    plantWord.set(key, fam)
  }
}

function simpleTree(kingdom, defs, wordMap) {
  for (const [id, name, a, b] of defs) {
    const hasParent = defs[0].length === 4
    const parent = hasParent ? (a ? `${kingdom}:${a}` : `k:${kingdom}`) : `k:${kingdom}`
    const list = hasParent ? b : a
    group(`${kingdom}:${id}`, name, 'group', parent)
    for (const w of words(list)) {
      if (wordMap.has(w)) throw new Error(`Word ${w} in ${kingdom}:${id} and ${wordMap.get(w)}`)
      wordMap.set(w, `${kingdom}:${id}`)
    }
  }
}
const kingdomWord = new Map() // first word → group id (non-plant, non-mineral kingdoms)
simpleTree('animal', ANIMAL_GROUPS, kingdomWord)
simpleTree('fungus', FUNGUS_GROUPS, kingdomWord)
simpleTree('nosode', NOSODE_GROUPS, kingdomWord)
simpleTree('sarcode', SARCODE_GROUPS, kingdomWord)
simpleTree('impon', IMPONDERABLE_GROUPS, kingdomWord)
simpleTree('bacteria', BACTERIA_GROUPS, kingdomWord)
simpleTree('other', OTHER_GROUPS, kingdomWord)
for (const w of kingdomWord.keys()) if (plantWord.has(w)) throw new Error(`Word ${w} is both plant and ${kingdomWord.get(w)}`)

// mineral tree
const EL = new Map(ELEMENTS.map(([sym, z, name, period, pg]) => [sym, { sym, z, name, period, pg }]))
group('mineral:periods', 'Periodic table by period', 'category', 'k:mineral')
group('mineral:pgroups', 'Periodic groups', 'category', 'k:mineral')
group('mineral:salts', 'Salts by anion', 'category', 'k:mineral')
for (let p = 1; p <= 7; p++) group(`mineral:period:${p}`, `Period ${p}`, 'period', 'mineral:periods')
for (const key of [...Array.from({ length: 18 }, (_, i) => i + 1), 'La', 'Ac']) {
  const label = typeof key === 'number' ? `Group ${key} · ${PERIODIC_GROUP_NAMES[key]}` : PERIODIC_GROUP_NAMES[key]
  group(`mineral:pgroup:${key}`, label, 'series', 'mineral:pgroups')
}
for (const e of [...EL.values()].sort((a, b) => a.z - b.z)) group(`mineral:el:${e.sym}`, `${e.name} (${e.sym})`, 'element', `mineral:period:${e.period}`, `Z ${e.z}`)
for (const [id, name] of Object.entries(SALT_NAMES)) group(`mineral:salt:${id}`, name, 'salt', 'mineral:salts')
// elements used as such (metals, sulphur, phosphorus …) are not salts: a sibling of "Salts by anion"
group('mineral:elements', 'Elements & metals', 'category', 'k:mineral', 'uncombined')
/** Group id for an anion key; 'metals' (bare element) maps to the elements group. */
const saltGroup = key => (key === 'metals' ? 'mineral:elements' : `mineral:salt:${key}`)
group('mineral:ammonium', 'Ammonium salts (NH₄)', 'series', 'k:mineral')
group('mineral:acids', 'Mineral acids', 'category', 'k:mineral')
for (const [id, name] of MINERAL_CATEGORIES) group(`mineral:${id}`, name, 'category', 'k:mineral')
const elementWord = new Map()
for (const [sym, list] of Object.entries(ELEMENT_WORDS)) for (const w of words(list)) elementWord.set(w, sym)

// themes
group('theme', 'Themes', 'theme', null)
group('theme:sea', 'Sea remedies', 'theme', 'theme')
group('theme:isolates', 'Alkaloids & plant isolates', 'theme', 'theme')
// carbon remedies by origin: wood charcoal (Carb-v), animal charcoal (Carb-an), coal, graphite, diamond
group('theme:carbons', 'Carbons & charcoals', 'theme', 'theme')
const CARBONS = new Set(['carbo vegetabilis', 'carbo animalis', 'graphites', 'adamas', 'anthrakokali', 'carboneum'])
const seaNames = new Set(SEA.split('|'))
const ISOLATE = /(inum|inium|ine|in|olum)$/

function addElements(rid, syms) {
  for (const s of syms) {
    const e = EL.get(s)
    if (!e) throw new Error(`Unknown element ${s}`)
    add(`mineral:el:${s}`, rid)
    add(`mineral:pgroup:${e.pg}`, rid)
  }
}

const norm = s => s.toLowerCase().replace(/[.,()+]/g, ' ').replace(/-/g, ' ').trim()
const firstWord = name => norm(name).split(/\s+/)[0]

/** Classify one remedy. Returns a label for the report or null when unclassified. */
function classify(rid, name) {
  const lname = name.toLowerCase().trim()
  const ws = norm(name).split(/\s+/)
  const w0 = ws[0]

  if (Object.prototype.hasOwnProperty.call(FULL, lname)) {
    const spec = FULL[lname]
    if (spec === null) return null
    const [kind, ...rest] = spec.split(':')
    const target = rest.join(':')
    if (kind === 'plant') { add(`plant:family:${target}`, rid); return 'plant' }
    if (kind === 'mineral') {
      if (target.startsWith('el:')) {
        const [els, salt] = target.slice(3).split('|')
        addElements(rid, words(els))
        if (salt) add(saltGroup(salt), rid)
        else addSalts(rid, ws.slice(1))
      } else add(`mineral:${target}`, rid)
      return 'mineral'
    }
    add(`${kind}:${target}`, rid)
    return kind
  }

  const fam = plantWord.get(w0)
  if (fam) {
    add(`plant:family:${fam}`, rid)
    if (ISOLATE.test(w0) && w0 !== 'linum') add('theme:isolates', rid)
    return 'plant'
  }
  const kg = kingdomWord.get(w0)
  if (kg) { add(kg, rid); return kg.split(':')[0] }

  // acids
  const ai = ws.indexOf('acidum')
  if (ai >= 0) {
    const adj = ai === 0 ? ws[1] : ws[0]
    if (INORGANIC_ACIDS[adj]) { add('mineral:acids', rid); addElements(rid, words(INORGANIC_ACIDS[adj]).filter(e => e !== 'O' && e !== 'H' || adj === 'osmicum')); return 'mineral' }
    const og = kingdomWord.get(adj)
    if (og) { add(og, rid); return og.split(':')[0] }
    if (plantWord.get(adj)) { add(`plant:family:${plantWord.get(adj)}`, rid); return 'plant' }
    add('other:organic-acids', rid)
    return 'other'
  }

  // minerals
  if (w0 === 'ammonium') {
    add('mineral:ammonium', rid)
    addElements(rid, ['N'])
    addSalts(rid, ws.slice(1))
    return 'mineral'
  }
  const sym = elementWord.get(w0) ?? (w0 === 'various' ? elementWord.get(ws[1]) : undefined)
  if (sym) {
    const syms = new Set([sym])
    for (const w of ws.slice(1)) if (ELEMENT_ADJ[w]) syms.add(ELEMENT_ADJ[w])
    addElements(rid, [...syms])
    const salted = addSalts(rid, ws.slice(1))
    if (!salted && ws.length === 1) add('mineral:elements', rid) // bare element name = the element itself
    return 'mineral'
  }
  for (const [id, , map] of MINERAL_CATEGORIES) {
    if (Object.prototype.hasOwnProperty.call(map, w0) || (id === 'waters' && ws.includes('aqua'))) {
      add(`mineral:${id}`, rid)
      const els = map[w0]
      if (els) addElements(rid, words(els))
      return 'mineral'
    }
  }
  if (/\bnosode\b/.test(lname)) { add('nosode:pathological', rid); return 'nosode' }
  return null
}

function addSalts(rid, rest) {
  let any = false
  for (const w of rest) {
    const a = ANIONS[w]
    if (!a) continue
    add(saltGroup(a[0]), rid)
    // oxygen/hydrogen only count for oxides & hydroxides, not for every oxy-anion
    if (a[1]) addElements(rid, words(a[1]).filter(e => a[0] === 'oxides' || (e !== 'O' && e !== 'H')))
    any = true
  }
  return any
}

let classified = 0
const unclassified = []
const perKingdom = {}
for (const [rid, , name] of remedies) {
  const k = classify(rid, name)
  if (seaNames.has(name.toLowerCase().trim())) add('theme:sea', rid)
  if (CARBONS.has(name.toLowerCase().trim())) add('theme:carbons', rid)
  if (k) { classified++; perKingdom[k] = (perKingdom[k] ?? 0) + 1 } else unclassified.push(`${rid} ${name}`)
}

// propagate members up the tree and drop empty groups
const list = [...groups.values()]
const children = new Map()
for (const g of list) if (g.parent) (children.get(g.parent) ?? children.set(g.parent, []).get(g.parent)).push(g)
function collect(g) {
  for (const c of children.get(g.id) ?? []) for (const r of collect(c)) g.remedies.add(r)
  return g.remedies
}
for (const g of list) if (!g.parent) collect(g)
const kept = list.filter(g => g.remedies.size > 0)
const keptIds = new Set(kept.map(g => g.id))
for (const g of kept) if (g.parent && !keptIds.has(g.parent)) throw new Error(`Orphan ${g.id}`)

// stable order: kingdoms in fixed order, then tree order (depth-first), children sorted
const byId = new Map(kept.map(g => [g.id, g]))
const kids = new Map()
for (const g of kept) if (g.parent) (kids.get(g.parent) ?? kids.set(g.parent, []).get(g.parent)).push(g)
const naturalOrder = id => {
  const m = id.match(/^mineral:(period|pgroup):(\w+)$/)
  if (m) return m[2] === 'La' ? 100 : m[2] === 'Ac' ? 101 : Number(m[2])
  const e = id.match(/^mineral:el:(\w+)$/)
  if (e) return EL.get(e[1]).z
  const c = id.match(/^plant:clade:(\w+)$/)
  if (c) return CLADE_ORDER.indexOf(c[1])
  return null
}
const out = []
function walk(g) {
  const prim = [...g.remedies].filter(r => primary.get(r) === g.id).sort((a, b) => a - b)
  out.push({ id: g.id, name: g.name, kind: g.kind, parent: g.parent, ...(g.note ? { note: g.note } : {}), remedies: [...g.remedies].sort((a, b) => a - b), ...(prim.length ? { primary: prim } : {}) })
  const cs = kids.get(g.id) ?? []
  cs.sort((a, b) => {
    const na = naturalOrder(a.id), nb = naturalOrder(b.id)
    if (na !== null && nb !== null) return na - nb
    return 0
  })
  // keep declaration order for hand-ordered lists (animal/nosode groups, categories); sort plant orders/families alphabetically
  if (g.kind === 'clade' || g.kind === 'order') cs.sort((a, b) => a.name.localeCompare(b.name))
  for (const c of cs) walk(c)
}
for (const [k] of KINGDOMS) if (byId.has(`k:${k}`)) walk(byId.get(`k:${k}`))
if (byId.has('theme')) walk(byId.get('theme'))

const total = remedies.length
const file = {
  version: 1,
  source: {
    id: 'radar-opus-editorial',
    title: 'Radar Opus editorial remedy classification',
    licence: 'CC BY 4.0',
    note: 'Editorial classification built by scripts/build-families.mjs from explicit genus, element and name tables (APG IV botanical families, periodic table, zoological classes). Not copied from any proprietary family list. A group\'s remedies include those of its sub-groups; `primary` lists the remedies whose main classification is that group.',
    generated: 'scripts/build-families.mjs',
    remedyCount: total,
    classified,
    coverage: Math.round((classified / total) * 1000) / 10,
  },
  groups: out,
}
writeFileSync(resolve(root, 'public/data/families.json'), JSON.stringify(file))
console.log(`families.json: ${out.length} groups, ${classified}/${total} remedies classified (${file.source.coverage}%)`)
if (REPORT) {
  console.log(perKingdom)
  console.log(`Unclassified (${unclassified.length}):\n${unclassified.join('\n')}`)
}

